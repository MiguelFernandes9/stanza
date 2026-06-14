/* @ds-bundle: {"format":3,"namespace":"StanzaDesignSystem_d6c63d","components":[{"name":"Avatar","sourcePath":"components/data/Avatar.jsx"},{"name":"Card","sourcePath":"components/data/Card.jsx"},{"name":"Kbd","sourcePath":"components/data/Kbd.jsx"},{"name":"SegmentedControl","sourcePath":"components/data/SegmentedControl.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"StatusDot","sourcePath":"components/feedback/StatusDot.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"IconButton","sourcePath":"components/forms/IconButton.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"BlockTag","sourcePath":"components/stanza/BlockTag.jsx"},{"name":"CompilePill","sourcePath":"components/stanza/CompilePill.jsx"},{"name":"DiffHunk","sourcePath":"components/stanza/DiffHunk.jsx"},{"name":"DiffLine","sourcePath":"components/stanza/DiffLine.jsx"}],"sourceHashes":{"components/data/Avatar.jsx":"532563507cb6","components/data/Card.jsx":"6ba85a696fde","components/data/Kbd.jsx":"90779b422016","components/data/SegmentedControl.jsx":"1049c6c22a88","components/feedback/Badge.jsx":"3939308e5155","components/feedback/StatusDot.jsx":"2d437aa1e237","components/feedback/Toast.jsx":"d42a715c28f9","components/feedback/Tooltip.jsx":"d58e1298bc1d","components/forms/Button.jsx":"c7b893bdecf6","components/forms/Checkbox.jsx":"33aaeac5374c","components/forms/IconButton.jsx":"4201bff5e45d","components/forms/Input.jsx":"6934a0b4c565","components/forms/Switch.jsx":"74da3c40712a","components/stanza/BlockTag.jsx":"9fbc4137de48","components/stanza/CompilePill.jsx":"c705c8f10620","components/stanza/DiffHunk.jsx":"fc71aeea63f3","components/stanza/DiffLine.jsx":"268b9ccfda8d","ui_kits/stanza/ChatPane.jsx":"0fd64781decd","ui_kits/stanza/OpenScreen.jsx":"72f5a1f2273c","ui_kits/stanza/PdfPane.jsx":"3217522d322f","ui_kits/stanza/PdfPaneTwoCol.jsx":"b385cfe9cfac","ui_kits/stanza/Sidebar.jsx":"3efc6dcf6430","ui_kits/stanza/SourceEditor.jsx":"3bcd3cdf34ad","ui_kits/stanza/TitleBar.jsx":"5aa9156e8e94","ui_kits/stanza/Workspace.jsx":"d0a6cf55bfbd","ui_kits/stanza/app.jsx":"5766b98224dc","ui_kits/stanza/icons.jsx":"e257892786fc","ui_kits/stanza/paperData.js":"5b5953ec1668"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.StanzaDesignSystem_d6c63d = window.StanzaDesignSystem_d6c63d || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/data/Avatar.jsx
try { (() => {
/**
 * Avatar for chat participants. `claude` renders the Stanza-clay glyph
 * (the assistant's identity in the chat pane); otherwise initials on a
 * stable warm tint, or an image.
 */
function Avatar({
  name = '',
  claude = false,
  src = null,
  size = 28,
  style = {}
}) {
  const fs = Math.round(size * 0.4);
  if (claude) {
    return /*#__PURE__*/React.createElement("span", {
      title: "Claude",
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flex: '0 0 auto',
        borderRadius: 'var(--radius-md)',
        background: 'var(--clay-500)',
        color: 'var(--text-on-accent)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
        ...style
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: size * 0.56,
      height: size * 0.56,
      viewBox: "0 0 32 32",
      fill: "none"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "4",
      y: "4",
      width: "24",
      height: "24",
      rx: "5.5",
      stroke: "currentColor",
      strokeWidth: "2.1"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "9.5",
      y1: "11.5",
      x2: "22.5",
      y2: "11.5",
      stroke: "currentColor",
      strokeWidth: "2.1",
      strokeLinecap: "round"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "9.5",
      y1: "16",
      x2: "19",
      y2: "16",
      stroke: "currentColor",
      strokeWidth: "2.1",
      strokeLinecap: "round"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "9.5",
      y1: "20.5",
      x2: "23",
      y2: "20.5",
      stroke: "currentColor",
      strokeWidth: "2.1",
      strokeLinecap: "round"
    })));
  }
  if (src) {
    return /*#__PURE__*/React.createElement("img", {
      src: src,
      alt: name,
      style: {
        width: size,
        height: size,
        borderRadius: 'var(--radius-md)',
        objectFit: 'cover',
        flex: '0 0 auto',
        ...style
      }
    });
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const tints = ['#3E6896', '#7A6A4E', '#5E7A5E', '#8A5B6E', '#4E6E7A'];
  const tint = tints[(name.charCodeAt(0) || 0) % tints.length];
  return /*#__PURE__*/React.createElement("span", {
    title: name,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      flex: '0 0 auto',
      borderRadius: 'var(--radius-md)',
      background: `color-mix(in oklab, ${tint} 16%, var(--paper-1))`,
      color: tint,
      font: `var(--weight-semibold) ${fs}px/1 var(--font-sans)`,
      letterSpacing: '0.01em',
      ...style
    }
  }, initials);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/data/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Paper surface container. The Stanza pane/card signature: hairline edge +
 * soft warm lift. Optional header (title + actions) and padded body.
 */
function Card({
  children,
  title = null,
  subtitle = null,
  actions = null,
  padding = 'md',
  elevation = 'card',
  style = {},
  bodyStyle = {},
  ...rest
}) {
  const pads = {
    none: '0',
    sm: '12px',
    md: '16px',
    lg: '22px'
  };
  const elev = {
    flat: {
      sh: 'none',
      bd: '1px solid var(--border-default)'
    },
    card: {
      sh: 'var(--shadow-sm)',
      bd: '1px solid var(--border-default)'
    },
    raised: {
      sh: 'var(--shadow-md)',
      bd: '1px solid var(--border-default)'
    },
    pop: {
      sh: 'var(--shadow-lg)',
      bd: '1px solid var(--border-strong)'
    }
  };
  const e = elev[elevation] || elev.card;
  const hasHeader = title != null || actions != null;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--surface-card)',
      border: e.bd,
      borderRadius: 'var(--radius-lg)',
      boxShadow: e.sh,
      overflow: 'hidden',
      ...style
    }
  }, rest), hasHeader && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '13px 16px',
      borderBottom: '1px solid var(--border-faint)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      font: `var(--weight-semibold) var(--text-base)/1.3 var(--font-sans)`,
      color: 'var(--ink-900)',
      letterSpacing: 'var(--tracking-tight)'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '2px',
      font: `var(--weight-regular) var(--text-xs)/1.4 var(--font-sans)`,
      color: 'var(--ink-500)'
    }
  }, subtitle)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      flex: '0 0 auto'
    }
  }, actions)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: pads[padding],
      ...bodyStyle
    }
  }, children));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Card.jsx", error: String((e && e.message) || e) }); }

// components/data/Kbd.jsx
try { (() => {
/**
 * Keyboard key cap. Mono, raised paper. Use for shortcut hints — Stanza is
 * keyboard-forward (⌘↵ to apply, ⌘R to compile, ⌘Z to reject).
 */
function Kbd({
  children,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("kbd", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18,
      height: 19,
      padding: '0 5px',
      font: `var(--weight-medium) var(--text-2xs)/1 var(--font-mono)`,
      color: 'var(--ink-600)',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-strong)',
      borderBottomWidth: '2px',
      borderRadius: 'var(--radius-xs)',
      boxShadow: 'var(--shadow-xs)',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Kbd });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Kbd.jsx", error: String((e && e.message) || e) }); }

// components/data/SegmentedControl.jsx
try { (() => {
/**
 * Segmented control — a small group of mutually-exclusive options on a
 * sunken track. Used for diff view mode (Inline / Side-by-side) and tabs.
 */
function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  style = {}
}) {
  const h = size === 'sm' ? 26 : 30;
  const fs = size === 'sm' ? 'var(--text-xs)' : 'var(--text-sm)';
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '2px',
      padding: '2px',
      background: 'var(--surface-well)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-inset)',
      ...style
    }
  }, options.map(opt => {
    const val = typeof opt === 'string' ? opt : opt.value;
    const lbl = typeof opt === 'string' ? opt : opt.label;
    const icon = typeof opt === 'string' ? null : opt.icon;
    const active = val === value;
    return /*#__PURE__*/React.createElement("button", {
      key: val,
      type: "button",
      role: "tab",
      "aria-selected": active,
      onClick: () => onChange && onChange(val),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: h,
        padding: '0 11px',
        font: `var(--weight-${active ? 'semibold' : 'medium'}) ${fs}/1 var(--font-sans)`,
        letterSpacing: 'var(--tracking-tight)',
        color: active ? 'var(--ink-900)' : 'var(--ink-500)',
        background: active ? 'var(--surface-card)' : 'transparent',
        border: active ? '1px solid var(--border-default)' : '1px solid transparent',
        borderRadius: 'var(--radius-sm)',
        boxShadow: active ? 'var(--shadow-xs)' : 'none',
        cursor: 'pointer',
        transition: 'color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)',
        whiteSpace: 'nowrap'
      }
    }, icon, lbl);
  }));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Compact status/label pill. Tones map to Stanza semantics — `add`/`del`
 * reuse the diff colors, so a Badge can label a hunk's nature.
 */
function Badge({
  children,
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  dot = false,
  style = {},
  ...rest
}) {
  const tones = {
    neutral: {
      fg: 'var(--ink-600)',
      soft: 'var(--surface-well)',
      solid: 'var(--ink-700)',
      line: 'var(--border-strong)'
    },
    accent: {
      fg: 'var(--clay-700)',
      soft: 'var(--clay-50)',
      solid: 'var(--clay-500)',
      line: 'var(--clay-200)'
    },
    add: {
      fg: 'var(--add-700)',
      soft: 'var(--add-bg)',
      solid: 'var(--add-600)',
      line: 'var(--add-line)'
    },
    del: {
      fg: 'var(--del-700)',
      soft: 'var(--del-bg)',
      solid: 'var(--del-600)',
      line: 'var(--del-line)'
    },
    warn: {
      fg: 'var(--warn-600)',
      soft: 'var(--warn-bg)',
      solid: 'var(--warn-500)',
      line: '#E6CFA0'
    },
    info: {
      fg: 'var(--blue-700)',
      soft: 'var(--blue-50)',
      solid: 'var(--blue-600)',
      line: 'var(--blue-100)'
    }
  };
  const t = tones[tone] || tones.neutral;
  const sizes = {
    sm: {
      h: 17,
      px: '6px',
      fs: 'var(--text-2xs)'
    },
    md: {
      h: 21,
      px: '8px',
      fs: 'var(--text-xs)'
    }
  };
  const s = sizes[size] || sizes.md;
  const solid = variant === 'solid';
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      height: s.h,
      padding: `0 ${s.px}`,
      font: `var(--weight-semibold) ${s.fs}/1 var(--font-sans)`,
      letterSpacing: 'var(--tracking-tight)',
      color: solid ? 'var(--text-on-accent)' : t.fg,
      background: solid ? t.solid : t.soft,
      border: `1px solid ${solid ? 'transparent' : t.line}`,
      borderRadius: 'var(--radius-pill)',
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: solid ? 'var(--text-on-accent)' : t.solid,
      flex: '0 0 auto'
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/StatusDot.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Status dot with optional pulse + label. Used in the toolbar to show
 * compile state (idle / running / ok / failed) and Claude session state.
 */
function StatusDot({
  tone = 'neutral',
  pulse = false,
  label = null,
  size = 8,
  style = {},
  ...rest
}) {
  const tones = {
    neutral: 'var(--ink-300)',
    accent: 'var(--clay-500)',
    ok: 'var(--add-600)',
    busy: 'var(--warn-500)',
    error: 'var(--del-600)',
    info: 'var(--blue-500)'
  };
  const c = tones[tone] || tones.neutral;
  const dot = /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      width: size,
      height: size,
      flex: '0 0 auto'
    }
  }, pulse && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: '50%',
      background: c,
      animation: 'stz-pulse 1.4s var(--ease-in-out) infinite'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      width: size,
      height: size,
      borderRadius: '50%',
      background: c,
      boxShadow: `0 0 0 3px color-mix(in oklab, ${c} 16%, transparent)`
    }
  }));
  if (label == null) return dot;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '7px',
      font: `var(--weight-medium) var(--text-sm)/1 var(--font-sans)`,
      color: 'var(--ink-600)',
      ...style
    }
  }, rest), dot, label);
}
Object.assign(__ds_scope, { StatusDot });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/StatusDot.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
/**
 * Toast notification card. Shown after an op completes (edit applied,
 * reverted, compile failed). Carries a tone stripe + optional action.
 */
function Toast({
  title,
  message = null,
  tone = 'neutral',
  icon = null,
  action = null,
  onDismiss = null,
  style = {}
}) {
  const tones = {
    neutral: 'var(--ink-500)',
    accent: 'var(--clay-500)',
    success: 'var(--add-600)',
    danger: 'var(--del-600)',
    warn: 'var(--warn-500)'
  };
  const stripe = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '11px',
      width: 340,
      padding: '13px 14px 13px 15px',
      background: 'var(--surface-overlay)',
      border: '1px solid var(--border-default)',
      borderLeft: `3px solid ${stripe}`,
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-lg)',
      animation: 'stz-fade-up var(--dur-slow) var(--ease-out)',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: stripe,
      display: 'inline-flex',
      marginTop: '1px',
      flex: '0 0 auto'
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '1 1 auto',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: `var(--weight-semibold) var(--text-base)/1.3 var(--font-sans)`,
      color: 'var(--ink-900)'
    }
  }, title), message && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '3px',
      font: `var(--weight-regular) var(--text-sm)/1.45 var(--font-sans)`,
      color: 'var(--ink-500)'
    }
  }, message), action && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '9px'
    }
  }, action)), onDismiss && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Dismiss",
    onClick: onDismiss,
    style: {
      flex: '0 0 auto',
      display: 'inline-flex',
      padding: '2px',
      border: 'none',
      background: 'transparent',
      color: 'var(--ink-400)',
      cursor: 'pointer',
      borderRadius: 'var(--radius-xs)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  }))));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
const {
  useState
} = React;
/**
 * Lightweight hover/focus tooltip. Wraps a single trigger; renders a small
 * paper-overlay bubble on one of four sides. Includes an optional kbd hint.
 */
function Tooltip({
  label,
  hint = null,
  side = 'top',
  children,
  delay = 120,
  style = {}
}) {
  const [open, setOpen] = useState(false);
  let timer = null;
  const show = () => {
    timer = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer);
    setOpen(false);
  };
  const pos = {
    top: {
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      mb: '8px'
    },
    bottom: {
      top: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      mt: '8px'
    },
    left: {
      right: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      mr: '8px'
    },
    right: {
      left: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      ml: '8px'
    }
  };
  const pp = pos[side] || pos.top;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      ...style
    },
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocusCapture: () => setOpen(true),
    onBlurCapture: () => setOpen(false)
  }, children, open && /*#__PURE__*/React.createElement("span", {
    role: "tooltip",
    style: {
      position: 'absolute',
      zIndex: 50,
      top: pp.top,
      bottom: pp.bottom,
      left: pp.left,
      right: pp.right,
      transform: pp.transform,
      marginTop: pp.mt,
      marginBottom: pp.mb,
      marginLeft: pp.ml,
      marginRight: pp.mr,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '5px 9px',
      background: 'var(--ink-900)',
      color: 'var(--paper-1)',
      font: `var(--weight-medium) var(--text-xs)/1.3 var(--font-sans)`,
      letterSpacing: 'var(--tracking-tight)',
      borderRadius: 'var(--radius-sm)',
      boxShadow: 'var(--shadow-lg)',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      animation: 'stz-fade-up var(--dur-fast) var(--ease-out)'
    }
  }, label, hint && /*#__PURE__*/React.createElement("span", {
    style: {
      font: `var(--weight-medium) var(--text-2xs)/1 var(--font-mono)`,
      color: 'var(--ink-300)',
      padding: '2px 4px',
      borderRadius: 'var(--radius-xs)',
      background: 'rgba(255,255,255,0.10)'
    }
  }, hint)));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
/**
 * Stanza Button — the primary action primitive.
 * Variants map to intent: primary (clay), secondary (paper), ghost,
 * subtle (clay tint), danger (deletion red). Sizes are desktop-dense.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  iconLeft = null,
  iconRight = null,
  disabled = false,
  loading = false,
  full = false,
  type = 'button',
  onClick,
  style = {},
  ...rest
}) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const sizes = {
    sm: {
      h: 'var(--control-h-sm)',
      px: '10px',
      fs: 'var(--text-sm)',
      gap: '6px'
    },
    md: {
      h: 'var(--control-h-md)',
      px: '14px',
      fs: 'var(--text-base)',
      gap: '7px'
    },
    lg: {
      h: 'var(--control-h-lg)',
      px: '20px',
      fs: 'var(--text-md)',
      gap: '9px'
    }
  };
  const s = sizes[size] || sizes.md;
  const palettes = {
    primary: {
      bg: 'var(--clay-500)',
      bgH: 'var(--clay-600)',
      bgA: 'var(--clay-700)',
      fg: 'var(--text-on-accent)',
      bd: 'transparent',
      sh: 'var(--shadow-sm)'
    },
    secondary: {
      bg: 'var(--surface-card)',
      bgH: 'var(--paper-0)',
      bgA: 'var(--surface-well)',
      fg: 'var(--ink-800)',
      bd: 'var(--border-strong)',
      sh: 'var(--shadow-xs)'
    },
    ghost: {
      bg: 'transparent',
      bgH: 'var(--hover-fill)',
      bgA: 'rgba(33,30,25,0.08)',
      fg: 'var(--ink-700)',
      bd: 'transparent',
      sh: 'none'
    },
    subtle: {
      bg: 'var(--clay-50)',
      bgH: 'var(--clay-100)',
      bgA: 'var(--clay-200)',
      fg: 'var(--clay-700)',
      bd: 'transparent',
      sh: 'none'
    },
    danger: {
      bg: 'var(--del-600)',
      bgH: 'var(--del-700)',
      bgA: 'var(--del-700)',
      fg: 'var(--text-on-accent)',
      bd: 'transparent',
      sh: 'var(--shadow-sm)'
    }
  };
  const p = palettes[variant] || palettes.primary;
  const bg = disabled ? 'var(--surface-well)' : press ? p.bgA : hover ? p.bgH : p.bg;
  const fg = disabled ? 'var(--text-disabled)' : p.fg;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled || loading,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    style: {
      display: full ? 'flex' : 'inline-flex',
      width: full ? '100%' : 'auto',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s.gap,
      height: s.h,
      padding: `0 ${s.px}`,
      font: `var(--weight-semibold) ${s.fs}/1 var(--font-sans)`,
      letterSpacing: 'var(--tracking-tight)',
      color: fg,
      background: bg,
      border: `1px solid ${disabled ? 'var(--border-default)' : p.bd}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: disabled ? 'none' : hover || press ? 'none' : p.sh,
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      transform: press && !disabled ? 'translateY(0.5px)' : 'none',
      transition: 'background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
      whiteSpace: 'nowrap',
      opacity: 1,
      ...style
    }
  }, rest), loading && /*#__PURE__*/React.createElement(Spinner, null), !loading && iconLeft, children != null && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block'
    }
  }, children), !loading && iconRight);
}
function Spinner() {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      width: '13px',
      height: '13px',
      borderRadius: '50%',
      border: '2px solid currentColor',
      borderRightColor: 'transparent',
      display: 'inline-block',
      animation: 'stz-spin 0.6s linear infinite',
      opacity: 0.9
    }
  });
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
/**
 * Checkbox with the Stanza paper-well aesthetic. Clay check when on.
 */
function Checkbox({
  checked = false,
  indeterminate = false,
  onChange,
  disabled = false,
  label = null,
  id,
  ...rest
}) {
  const [hover, setHover] = useState(false);
  const on = checked || indeterminate;
  const box = /*#__PURE__*/React.createElement("span", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 17,
      height: 17,
      flex: '0 0 auto',
      borderRadius: 'var(--radius-xs)',
      background: on ? 'var(--clay-500)' : 'var(--surface-card)',
      border: `1px solid ${on ? 'var(--clay-500)' : hover ? 'var(--line-ink)' : 'var(--border-strong)'}`,
      boxShadow: on ? 'none' : 'var(--shadow-inset)',
      transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)'
    }
  }, checked && !indeterminate && /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 12 12",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2.5 6.2L4.8 8.5L9.5 3.5",
    stroke: "var(--text-on-accent)",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), indeterminate && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 2,
      borderRadius: 1,
      background: 'var(--text-on-accent)'
    }
  }));
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '9px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.55 : 1,
      fontSize: 'var(--text-base)',
      color: 'var(--ink-700)'
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    id: id,
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    style: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0
    }
  }, rest)), box, label != null && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
/**
 * Square icon-only button for toolbars and pane chrome. Pair with a Tooltip
 * for labels. Variants echo Button; `active` shows a held/toggled state.
 */
function IconButton({
  children,
  label,
  size = 'md',
  variant = 'ghost',
  active = false,
  disabled = false,
  onClick,
  style = {},
  ...rest
}) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const dims = {
    sm: 26,
    md: 32,
    lg: 40
  };
  const d = dims[size] || dims.md;
  const palettes = {
    ghost: {
      bg: 'transparent',
      bgH: 'var(--hover-fill)',
      fg: 'var(--ink-600)',
      fgA: 'var(--clay-600)'
    },
    solid: {
      bg: 'var(--surface-card)',
      bgH: 'var(--paper-0)',
      fg: 'var(--ink-700)',
      fgA: 'var(--clay-600)'
    }
  };
  const p = palettes[variant] || palettes.ghost;
  const bg = active ? 'var(--clay-50)' : press ? 'rgba(33,30,25,0.08)' : hover ? p.bgH : p.bg;
  const fg = disabled ? 'var(--text-disabled)' : active ? p.fgA : hover ? 'var(--ink-800)' : p.fg;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    title: label,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: d,
      height: d,
      color: fg,
      background: bg,
      border: variant === 'solid' ? '1px solid var(--border-strong)' : '1px solid transparent',
      borderRadius: 'var(--radius-md)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
/**
 * Text input on a sunken paper well. Supports leading/trailing adornments,
 * mono mode (for paths / commands), and an error state.
 */
function Input({
  size = 'md',
  iconLeft = null,
  trailing = null,
  mono = false,
  invalid = false,
  disabled = false,
  style = {},
  wrapStyle = {},
  ...rest
}) {
  const [focus, setFocus] = useState(false);
  const heights = {
    sm: 'var(--control-h-sm)',
    md: 'var(--control-h-md)',
    lg: 'var(--control-h-lg)'
  };
  const fs = {
    sm: 'var(--text-sm)',
    md: 'var(--text-base)',
    lg: 'var(--text-md)'
  };
  const border = invalid ? 'var(--del-600)' : focus ? 'var(--clay-500)' : 'var(--border-strong)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      height: heights[size],
      padding: '0 10px',
      background: disabled ? 'var(--surface-well)' : 'var(--surface-card)',
      border: `1px solid ${border}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: focus ? invalid ? '0 0 0 3px rgba(178,58,58,0.18)' : '0 0 0 3px var(--accent-ring)' : 'var(--shadow-inset)',
      transition: 'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
      cursor: disabled ? 'not-allowed' : 'text',
      ...wrapStyle
    }
  }, iconLeft && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      color: 'var(--ink-400)',
      flex: '0 0 auto'
    }
  }, iconLeft), /*#__PURE__*/React.createElement("input", _extends({
    disabled: disabled,
    onFocus: e => {
      setFocus(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      rest.onBlur && rest.onBlur(e);
    },
    style: {
      flex: '1 1 auto',
      minWidth: 0,
      height: '100%',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: 'var(--ink-900)',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
      fontSize: mono ? '0.92em' : fs[size],
      letterSpacing: mono ? '0' : 'var(--tracking-tight)',
      ...style
    }
  }, rest)), trailing && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      color: 'var(--ink-400)',
      flex: '0 0 auto'
    }
  }, trailing));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Toggle switch for binary settings (e.g. "auto-recompile"). Clay when on.
 */
function Switch({
  checked = false,
  onChange,
  disabled = false,
  size = 'md',
  label = null,
  id,
  ...rest
}) {
  const dims = size === 'sm' ? {
    w: 30,
    h: 18,
    k: 12,
    pad: 3
  } : {
    w: 38,
    h: 22,
    k: 16,
    pad: 3
  };
  const x = checked ? dims.w - dims.k - dims.pad : dims.pad;
  const toggle = /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    role: "switch",
    "aria-checked": checked,
    "aria-label": typeof label === 'string' ? label : undefined,
    disabled: disabled,
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      position: 'relative',
      width: dims.w,
      height: dims.h,
      flex: '0 0 auto',
      padding: 0,
      border: 'none',
      borderRadius: 'var(--radius-pill)',
      background: checked ? 'var(--clay-500)' : 'var(--line-strong)',
      boxShadow: 'var(--shadow-inset)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'background var(--dur-base) var(--ease-out)'
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: dims.pad,
      left: x,
      width: dims.k,
      height: dims.k,
      borderRadius: '50%',
      background: 'var(--paper-2)',
      boxShadow: '0 1px 2px rgba(58,42,24,0.28)',
      transition: 'left var(--dur-base) var(--ease-spring)'
    }
  }));
  if (label == null) return toggle;
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '9px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: 'var(--text-base)',
      color: 'var(--ink-700)'
    }
  }, toggle, /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/stanza/BlockTag.jsx
try { (() => {
/**
 * BlockTag — a reference to an addressable block selected in the rendered PDF.
 * This is the unit Claude operations are scoped to. Shows a structural label
 * (§ section / environment kind) and its source span (file:line). Removable.
 */
function BlockTag({
  label,
  span = null,
  kind = 'section',
  active = false,
  onRemove = null,
  onClick = null,
  style = {}
}) {
  // kind → leading glyph (structural typography motif)
  const glyphs = {
    section: '§',
    paragraph: '¶',
    equation: '∑',
    figure: '❏',
    table: '▦',
    itemize: '•',
    citation: '†'
  };
  const glyph = glyphs[kind] || '§';
  const clickable = !!onClick;
  return /*#__PURE__*/React.createElement("span", {
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '7px',
      height: 24,
      padding: onRemove ? '0 4px 0 8px' : '0 9px',
      background: active ? 'var(--clay-50)' : 'var(--surface-card)',
      border: `1px solid ${active ? 'var(--clay-300)' : 'var(--border-strong)'}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: active ? '0 0 0 2px var(--accent-ring)' : 'var(--shadow-xs)',
      cursor: clickable ? 'pointer' : 'default',
      maxWidth: 240,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: `var(--weight-semibold) var(--text-sm)/1 var(--font-serif)`,
      color: active ? 'var(--clay-600)' : 'var(--ink-500)',
      flex: '0 0 auto'
    }
  }, glyph), /*#__PURE__*/React.createElement("span", {
    style: {
      font: `var(--weight-semibold) var(--text-xs)/1 var(--font-sans)`,
      color: 'var(--ink-800)',
      letterSpacing: 'var(--tracking-tight)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, label), span && /*#__PURE__*/React.createElement("span", {
    style: {
      font: `var(--weight-regular) var(--text-2xs)/1 var(--font-mono)`,
      color: 'var(--ink-400)',
      flex: '0 0 auto'
    }
  }, span), onRemove && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Remove block",
    onClick: e => {
      e.stopPropagation();
      onRemove();
    },
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 16,
      height: 16,
      marginLeft: '1px',
      border: 'none',
      background: 'transparent',
      color: 'var(--ink-400)',
      borderRadius: 'var(--radius-xs)',
      cursor: 'pointer',
      flex: '0 0 auto'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  }))));
}
Object.assign(__ds_scope, { BlockTag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/stanza/BlockTag.jsx", error: String((e && e.message) || e) }); }

// components/stanza/CompilePill.jsx
try { (() => {
/**
 * Compile status pill for the toolbar — reflects the tectonic compile
 * lifecycle (idle / running / ok / failed) with an error/warning count.
 */
function CompilePill({
  state = 'ok',
  errors = 0,
  warnings = 0,
  onClick = null,
  style = {}
}) {
  const map = {
    idle: {
      dot: 'var(--ink-300)',
      label: 'Idle',
      fg: 'var(--ink-500)',
      pulse: false
    },
    running: {
      dot: 'var(--warn-500)',
      label: 'Compiling…',
      fg: 'var(--ink-700)',
      pulse: true
    },
    ok: {
      dot: 'var(--add-600)',
      label: 'Compiled',
      fg: 'var(--ink-700)',
      pulse: false
    },
    failed: {
      dot: 'var(--del-600)',
      label: 'Failed',
      fg: 'var(--del-700)',
      pulse: false
    }
  };
  const m = map[state] || map.ok;
  const clickable = !!onClick;
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    disabled: !clickable,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      height: 28,
      padding: '0 11px',
      background: state === 'failed' ? 'var(--del-bg)' : 'var(--surface-card)',
      border: `1px solid ${state === 'failed' ? 'var(--del-line)' : 'var(--border-strong)'}`,
      borderRadius: 'var(--radius-pill)',
      cursor: clickable ? 'pointer' : 'default',
      boxShadow: 'var(--shadow-xs)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      width: 8,
      height: 8
    }
  }, m.pulse && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: '50%',
      background: m.dot,
      animation: 'stz-pulse 1.4s var(--ease-in-out) infinite'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: m.dot
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      font: `var(--weight-semibold) var(--text-xs)/1 var(--font-sans)`,
      color: m.fg,
      letterSpacing: 'var(--tracking-tight)'
    }
  }, m.label), (errors > 0 || warnings > 0) && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      gap: '6px',
      font: `var(--weight-semibold) var(--text-2xs)/1 var(--font-mono)`
    }
  }, errors > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--del-600)'
    }
  }, errors, "\xA0err"), warnings > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--warn-600)'
    }
  }, warnings, "\xA0warn")));
}
Object.assign(__ds_scope, { CompilePill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/stanza/CompilePill.jsx", error: String((e && e.message) || e) }); }

// components/stanza/DiffLine.jsx
try { (() => {
/**
 * A single line in a unified diff, in the Stanza paper-diff aesthetic:
 * muted printer's-ink add/del fills, mono source, gutter line numbers.
 */
function DiffLine({
  type = 'context',
  oldNo = null,
  newNo = null,
  text = ''
}) {
  const styles = {
    add: {
      bg: 'var(--add-bg)',
      sign: '+',
      signC: 'var(--add-600)',
      edge: 'var(--add-line)'
    },
    del: {
      bg: 'var(--del-bg)',
      sign: '−',
      signC: 'var(--del-600)',
      edge: 'var(--del-line)'
    },
    context: {
      bg: 'transparent',
      sign: ' ',
      signC: 'var(--ink-300)',
      edge: 'transparent'
    },
    meta: {
      bg: 'var(--surface-well)',
      sign: ' ',
      signC: 'var(--ink-400)',
      edge: 'transparent'
    }
  };
  const s = styles[type] || styles.context;
  const isMeta = type === 'meta';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'stretch',
      background: s.bg,
      boxShadow: s.edge !== 'transparent' ? `inset 2px 0 0 ${s.edge}` : 'none',
      font: `var(--weight-regular) var(--text-sm)/1.55 var(--font-mono)`,
      minHeight: '21px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: '0 0 auto',
      width: 34,
      textAlign: 'right',
      padding: '0 8px',
      color: 'var(--ink-300)',
      userSelect: 'none',
      fontSize: 'var(--text-2xs)'
    }
  }, oldNo ?? ''), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: '0 0 auto',
      width: 34,
      textAlign: 'right',
      padding: '0 8px',
      color: 'var(--ink-300)',
      userSelect: 'none',
      fontSize: 'var(--text-2xs)',
      borderRight: '1px solid var(--border-faint)'
    }
  }, newNo ?? ''), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: '0 0 auto',
      width: 18,
      textAlign: 'center',
      color: s.signC,
      userSelect: 'none',
      fontWeight: 'var(--weight-semibold)'
    }
  }, s.sign), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: '1 1 auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      paddingRight: 12,
      color: isMeta ? 'var(--ink-400)' : 'var(--ink-800)',
      fontStyle: isMeta ? 'italic' : 'normal'
    }
  }, text));
}
Object.assign(__ds_scope, { DiffLine });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/stanza/DiffLine.jsx", error: String((e && e.message) || e) }); }

// components/stanza/DiffHunk.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Renders a unified diff string as a Stanza paper-diff card: a file header
 * with +/− counts, then the parsed hunks. This is the body of a "proposal"
 * in the review flow.
 */
function DiffHunk({
  file = 'main.tex',
  diff = '',
  style = {}
}) {
  const lines = parseUnifiedDiff(diff);
  const adds = lines.filter(l => l.type === 'add').length;
  const dels = lines.filter(l => l.type === 'del').length;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      background: 'var(--surface-card)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 12px',
      background: 'var(--surface-app)',
      borderBottom: '1px solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: `var(--weight-medium) var(--text-sm)/1 var(--font-mono)`,
      color: 'var(--ink-700)'
    }
  }, file), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: `var(--weight-semibold) var(--text-xs)/1 var(--font-mono)`,
      color: 'var(--add-600)'
    }
  }, "+", adds), /*#__PURE__*/React.createElement("span", {
    style: {
      font: `var(--weight-semibold) var(--text-xs)/1 var(--font-mono)`,
      color: 'var(--del-600)'
    }
  }, "\u2212", dels)), /*#__PURE__*/React.createElement("div", null, lines.map((l, i) => /*#__PURE__*/React.createElement(__ds_scope.DiffLine, _extends({
    key: i
  }, l)))));
}

/** Minimal unified-diff parser → DiffLine props. Tracks dual line numbers. */
function parseUnifiedDiff(diff) {
  const out = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of String(diff).replace(/\n$/, '').split('\n')) {
    if (raw.startsWith('@@')) {
      const m = raw.match(/@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)(?:,\d+)?\s*@@/);
      if (m) {
        oldNo = parseInt(m[1], 10);
        newNo = parseInt(m[2], 10);
      }
      out.push({
        type: 'meta',
        text: raw
      });
      continue;
    }
    if (raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('diff ') || raw.startsWith('index ')) {
      continue;
    }
    if (raw.startsWith('+')) {
      out.push({
        type: 'add',
        newNo,
        text: raw.slice(1)
      });
      newNo++;
    } else if (raw.startsWith('-')) {
      out.push({
        type: 'del',
        oldNo,
        text: raw.slice(1)
      });
      oldNo++;
    } else {
      const t = raw.startsWith(' ') ? raw.slice(1) : raw;
      out.push({
        type: 'context',
        oldNo,
        newNo,
        text: t
      });
      oldNo++;
      newNo++;
    }
  }
  return out;
}
Object.assign(__ds_scope, { DiffHunk });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/stanza/DiffHunk.jsx", error: String((e && e.message) || e) }); }

// ui_kits/stanza/ChatPane.jsx
try { (() => {
/* Stanza UI kit — ChatPane: instruction input, message stream, inline proposal */
(function () {
  const {
    Button,
    IconButton,
    Avatar,
    Badge,
    BlockTag,
    DiffHunk,
    StatusDot,
    Kbd
  } = window.StanzaDesignSystem_d6c63d;
  const I = window.Icons;
  function Proposal({
    proposal,
    onAccept,
    onReject,
    resolved
  }) {
    if (resolved) {
      return /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          marginTop: 10,
          padding: '6px 11px',
          borderRadius: 'var(--radius-pill)',
          background: resolved === 'accept' ? 'var(--add-bg)' : 'var(--del-bg)',
          border: `1px solid ${resolved === 'accept' ? 'var(--add-line)' : 'var(--del-line)'}`
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          color: resolved === 'accept' ? 'var(--add-600)' : 'var(--del-600)',
          display: 'inline-flex'
        }
      }, resolved === 'accept' ? /*#__PURE__*/React.createElement(I.Commit, {
        size: 13
      }) : /*#__PURE__*/React.createElement(I.Undo, {
        size: 13
      })), /*#__PURE__*/React.createElement("span", {
        style: {
          font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)',
          color: resolved === 'accept' ? 'var(--add-700)' : 'var(--del-700)'
        }
      }, resolved === 'accept' ? 'Accepted · committed to intro.tex' : 'Rejected · restored'));
    }
    return /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 11
      }
    }, /*#__PURE__*/React.createElement(DiffHunk, {
      file: proposal.files[0],
      diff: proposal.diff
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 10
      }
    }, /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: "primary",
      iconLeft: /*#__PURE__*/React.createElement(I.Check, {
        size: 14
      }),
      onClick: onAccept
    }, "Accept"), /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: "secondary",
      iconLeft: /*#__PURE__*/React.createElement(I.X, {
        size: 14
      }),
      onClick: onReject
    }, "Reject"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 4,
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement(Kbd, null, "\u2318"), /*#__PURE__*/React.createElement(Kbd, null, "\u21B5"))));
  }
  function Message({
    m,
    onAccept,
    onReject
  }) {
    const isUser = m.role === 'user';
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start'
      }
    }, isUser ? /*#__PURE__*/React.createElement(Avatar, {
      name: "Miguel Fernandes",
      size: 26
    }) : /*#__PURE__*/React.createElement(Avatar, {
      claude: true,
      size: 26
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        marginBottom: 3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-semibold) var(--text-sm)/1 var(--font-sans)',
        color: 'var(--ink-800)'
      }
    }, isUser ? 'You' : 'Claude'), m.blocks && m.blocks.map(b => /*#__PURE__*/React.createElement("span", {
      key: b.id,
      style: {
        font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-mono)',
        color: 'var(--clay-600)',
        background: 'var(--clay-50)',
        padding: '2px 6px',
        borderRadius: 'var(--radius-pill)'
      }
    }, "\xA7", ' ', b.file.split('/').pop(), ":", b.span))), /*#__PURE__*/React.createElement("div", {
      style: {
        font: `var(--weight-regular) var(--text-base)/1.5 var(--font-sans)`,
        color: isUser ? 'var(--ink-900)' : 'var(--ink-600)'
      }
    }, m.text), m.proposal && /*#__PURE__*/React.createElement(Proposal, {
      proposal: m.proposal,
      resolved: m.resolved,
      onAccept: onAccept,
      onReject: onReject
    })));
  }
  function ChatPane({
    messages,
    busy,
    selectedBlocks,
    instruction,
    setInstruction,
    onRemoveBlock,
    onSubmit,
    onAccept,
    onReject
  }) {
    const streamRef = React.useRef(null);
    React.useEffect(() => {
      if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }, [messages.length, busy]);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        width: 428,
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-card)',
        borderLeft: '1px solid var(--border-default)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        height: 'var(--rail-toolbar)',
        flex: '0 0 auto',
        padding: '0 14px',
        borderBottom: '1px solid var(--border-default)'
      }
    }, /*#__PURE__*/React.createElement(I.Sparkles, {
      size: 16,
      style: {
        color: 'var(--clay-500)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-semibold) var(--text-base)/1 var(--font-sans)',
        color: 'var(--ink-900)'
      }
    }, "Assistant"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(StatusDot, {
      tone: busy ? 'busy' : 'ok',
      pulse: busy,
      label: busy ? 'Editing…' : 'Session ready'
    })), /*#__PURE__*/React.createElement("div", {
      ref: streamRef,
      style: {
        flex: 1,
        overflow: 'auto',
        padding: '18px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20
      }
    }, messages.map((m, i) => /*#__PURE__*/React.createElement(Message, {
      key: i,
      m: m,
      onAccept: onAccept,
      onReject: onReject
    })), busy && /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 10,
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      claude: true,
      size: 26
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 4
      }
    }, [0, 1, 2].map(n => /*#__PURE__*/React.createElement("span", {
      key: n,
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--clay-400)',
        animation: `stz-pulse 1s ${n * 0.16}s var(--ease-in-out) infinite`
      }
    }))))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: '0 0 auto',
        borderTop: '1px solid var(--border-default)',
        padding: 12,
        background: 'var(--surface-app)'
      }
    }, selectedBlocks.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 9
      }
    }, selectedBlocks.map(b => /*#__PURE__*/React.createElement(BlockTag, {
      key: b.id,
      kind: b.kind === 'title' ? 'section' : b.kind,
      label: blockLabel(b),
      span: `${b.file.split('/').pop()}:${b.span}`,
      active: true,
      onRemove: () => onRemoveBlock(b.id)
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        background: 'var(--surface-card)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-lg)',
        padding: '8px 8px 8px 12px',
        boxShadow: 'var(--shadow-inset)'
      }
    }, /*#__PURE__*/React.createElement("textarea", {
      value: instruction,
      onChange: e => setInstruction(e.target.value),
      onKeyDown: e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onSubmit();
        }
      },
      rows: 1,
      placeholder: selectedBlocks.length ? 'Instruct Claude for the selected block…' : 'Select a block in the page, then type an instruction…',
      style: {
        flex: 1,
        resize: 'none',
        border: 'none',
        outline: 'none',
        background: 'transparent',
        font: 'var(--weight-regular) var(--text-base)/1.45 var(--font-sans)',
        color: 'var(--ink-900)',
        maxHeight: 96,
        padding: '5px 0'
      }
    }), /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: "primary",
      disabled: !instruction.trim() || busy,
      onClick: onSubmit,
      style: {
        padding: '0 10px'
      },
      iconLeft: /*#__PURE__*/React.createElement(I.ArrowUp, {
        size: 15
      })
    }, "Run")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 7,
        paddingLeft: 2
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-sans)',
        color: 'var(--ink-400)'
      }
    }, "Claude Code edits the ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)'
      }
    }, ".tex"), " source directly \xB7 "), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 3,
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement(Kbd, null, "\u2318"), /*#__PURE__*/React.createElement(Kbd, null, "\u21B5")), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-sans)',
        color: 'var(--ink-400)'
      }
    }, "to run"))));
  }
  function blockLabel(b) {
    if (b.kind === 'section') return b.text.replace(/^\d+\s+/, '');
    if (b.kind === 'equation') return `eq (${b.num})`;
    if (b.kind === 'title') return 'Title';
    const map = {
      's1-p1': 'Opening paragraph',
      'abstract': 'Abstract',
      's1-p2': 'Paragraph',
      's2-p1': 'Paragraph',
      authors: 'Authors',
      affil: 'Affiliation'
    };
    return map[b.id] || 'Paragraph';
  }
  window.ChatPane = ChatPane;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/stanza/ChatPane.jsx", error: String((e && e.message) || e) }); }

// ui_kits/stanza/OpenScreen.jsx
try { (() => {
/* Stanza UI kit — OpenScreen: launch view.
   Three paths in, each honest about project state:
   · New document        → template + priming
   · Stanza project      → has a Claude session; opens straight in
   · Plain LaTeX folder  → has work but no session; gets PRIMED first
     (parse blocks · init version control · start Claude session) */
(function () {
  const {
    Button,
    Badge,
    StatusDot
  } = window.StanzaDesignSystem_d6c63d;
  const I = window.Icons;
  function Recent({
    name,
    path,
    meta,
    state,
    blocks,
    onOpen
  }) {
    const [hover, setHover] = React.useState(false);
    const primed = state === 'session';
    return /*#__PURE__*/React.createElement("button", {
      onClick: onOpen,
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        width: '100%',
        textAlign: 'left',
        padding: '12px 14px',
        background: hover ? 'var(--paper-1)' : 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-xs)',
        cursor: 'pointer',
        transition: 'box-shadow var(--dur-fast), background var(--dur-fast)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 38,
        height: 38,
        flex: '0 0 auto',
        borderRadius: 'var(--radius-md)',
        background: primed ? 'var(--clay-50)' : 'var(--surface-well)',
        color: primed ? 'var(--clay-600)' : 'var(--ink-400)'
      }
    }, primed ? /*#__PURE__*/React.createElement(I.FileText, {
      size: 19
    }) : /*#__PURE__*/React.createElement(I.Folder, {
      size: 19
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-semibold) var(--text-base)/1.3 var(--font-sans)',
        color: 'var(--ink-900)'
      }
    }, name), !primed && /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral",
      size: "sm"
    }, "not set up")), /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--text-xs)/1.4 var(--font-mono)',
        color: 'var(--ink-400)'
      }
    }, path)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 4,
        flex: '0 0 auto'
      }
    }, primed ? /*#__PURE__*/React.createElement(StatusDot, {
      tone: "ok",
      label: `session · ${blocks} blocks`
    }) : /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-sans)',
        color: hover ? 'var(--clay-600)' : 'var(--ink-400)',
        fontWeight: 500
      }
    }, hover ? 'set up & open' : 'plain folder'), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-sans)',
        color: 'var(--ink-300)'
      }
    }, meta)), /*#__PURE__*/React.createElement(I.ChevronRight, {
      size: 16,
      style: {
        color: hover ? 'var(--clay-500)' : 'var(--ink-300)',
        flex: '0 0 auto'
      }
    }));
  }

  // Priming: turning a folder (or fresh template) into a working project.
  function PrimingOverlay({
    project,
    steps,
    onDone,
    onCancel
  }) {
    const [done, setDone] = React.useState(0);
    React.useEffect(() => {
      if (done >= steps.length) {
        const t = setTimeout(onDone, 420);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setDone(d => d + 1), 520 + Math.random() * 420);
      return () => clearTimeout(t);
    }, [done]);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(33, 30, 25, 0.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'stz-fade-up 160ms var(--ease-out)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 420,
        background: 'var(--paper-1)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-xl)',
        padding: '20px 22px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        marginBottom: 4
      }
    }, /*#__PURE__*/React.createElement(I.Sparkles, {
      size: 16,
      style: {
        color: 'var(--clay-500)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-semibold) var(--text-md)/1.2 var(--font-sans)',
        color: 'var(--ink-900)'
      }
    }, "Setting up ", project)), /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--text-sm)/1.5 var(--font-sans)',
        color: 'var(--ink-500)',
        marginBottom: 16
      }
    }, "One-time setup \u2014 your files aren't changed until you accept an edit."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 9
      }
    }, steps.map((s, i) => {
      const state = i < done ? 'done' : i === done ? 'running' : 'pending';
      return /*#__PURE__*/React.createElement("div", {
        key: s.label,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          opacity: state === 'pending' ? 0.42 : 1,
          transition: 'opacity var(--dur-fast)'
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          flex: '0 0 auto'
        }
      }, state === 'done' ? /*#__PURE__*/React.createElement("span", {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'var(--add-bg)',
          color: 'var(--add-600)'
        }
      }, /*#__PURE__*/React.createElement(I.Check, {
        size: 10,
        stroke: 3
      })) : state === 'running' ? /*#__PURE__*/React.createElement("span", {
        style: {
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--clay-400)',
          animation: 'stz-pulse 0.9s var(--ease-in-out) infinite'
        }
      }) : /*#__PURE__*/React.createElement("span", {
        style: {
          width: 8,
          height: 8,
          borderRadius: '50%',
          border: '1.5px solid var(--line-ink)'
        }
      })), /*#__PURE__*/React.createElement("span", {
        style: {
          flex: 1,
          font: 'var(--text-sm)/1.3 var(--font-sans)',
          color: state === 'done' ? 'var(--ink-500)' : 'var(--ink-800)'
        }
      }, s.label), state === 'done' && s.result && /*#__PURE__*/React.createElement("span", {
        style: {
          font: 'var(--text-2xs)/1 var(--font-mono)',
          color: 'var(--ink-400)'
        }
      }, s.result));
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'flex-end',
        marginTop: 18
      }
    }, /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: "ghost",
      onClick: onCancel
    }, "Cancel"))));
  }
  const PRIME_FOLDER = n => [{
    label: 'Reading sources',
    result: '7 files'
  }, {
    label: 'Parsing into blocks',
    result: `${n} blocks`
  }, {
    label: 'Initializing version control',
    result: 'git init'
  }, {
    label: 'Starting Claude session',
    result: 'primed'
  }];
  const PRIME_NEW = [{
    label: 'Creating from template',
    result: 'article'
  }, {
    label: 'Initializing version control',
    result: 'git init'
  }, {
    label: 'Starting Claude session',
    result: 'primed'
  }];
  function OpenScreen({
    onOpen
  }) {
    const [priming, setPriming] = React.useState(null); // { project, steps }

    return /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-canvas)',
        padding: 40
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 480
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "40",
      height: "40",
      viewBox: "0 0 32 32",
      fill: "none"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "4",
      y: "4",
      width: "24",
      height: "24",
      rx: "5.5",
      stroke: "var(--ink-900)",
      strokeWidth: "2.1"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "9.5",
      y1: "11.5",
      x2: "22.5",
      y2: "11.5",
      stroke: "var(--ink-900)",
      strokeWidth: "2.1",
      strokeLinecap: "round"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "9.5",
      y1: "16",
      x2: "19",
      y2: "16",
      stroke: "var(--clay-500)",
      strokeWidth: "2.1",
      strokeLinecap: "round"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "9.5",
      y1: "20.5",
      x2: "23",
      y2: "20.5",
      stroke: "var(--ink-900)",
      strokeWidth: "2.1",
      strokeLinecap: "round"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--weight-semibold) 30px/1 var(--font-serif)',
        color: 'var(--ink-900)',
        letterSpacing: '-0.01em'
      }
    }, "Stanza")), /*#__PURE__*/React.createElement("p", {
      style: {
        font: 'var(--weight-regular) var(--text-lg)/1.5 var(--font-serif)',
        color: 'var(--ink-600)',
        margin: '0 0 26px'
      }
    }, "Edit your LaTeX paper in the page. Select a block, say what you want, review the diff."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 10,
        marginBottom: 26
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      iconLeft: /*#__PURE__*/React.createElement(I.Plus, {
        size: 17
      }),
      onClick: () => setPriming({
        project: 'untitled-paper',
        steps: PRIME_NEW
      })
    }, "New document"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "lg",
      iconLeft: /*#__PURE__*/React.createElement(I.Folder, {
        size: 17
      }),
      onClick: () => setPriming({
        project: 'a LaTeX folder',
        steps: PRIME_FOLDER(9)
      })
    }, "Open folder\u2026")), /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)',
        letterSpacing: 'var(--tracking-caps)',
        textTransform: 'uppercase',
        color: 'var(--ink-400)',
        marginBottom: 10
      }
    }, "Recent"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement(Recent, {
      name: "block-editing",
      path: "~/papers/block-editing",
      meta: "2m ago",
      state: "session",
      blocks: 11,
      onOpen: onOpen
    }), /*#__PURE__*/React.createElement(Recent, {
      name: "thesis-ch3",
      path: "~/papers/thesis/ch3",
      meta: "yesterday",
      state: "session",
      blocks: 42,
      onOpen: onOpen
    }), /*#__PURE__*/React.createElement(Recent, {
      name: "neurips-submission",
      path: "~/work/neurips-25",
      meta: "3d ago",
      state: "plain",
      onOpen: () => setPriming({
        project: 'neurips-submission',
        steps: PRIME_FOLDER(28)
      })
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--text-xs)/1.5 var(--font-sans)',
        color: 'var(--ink-400)',
        marginTop: 18
      }
    }, "Folders without a Claude session are set up on first open \u2014 blocks parsed, version control initialized, session primed.")), priming && /*#__PURE__*/React.createElement(PrimingOverlay, {
      project: priming.project,
      steps: priming.steps,
      onDone: onOpen,
      onCancel: () => setPriming(null)
    }));
  }
  window.OpenScreen = OpenScreen;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/stanza/OpenScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/stanza/PdfPane.jsx
try { (() => {
/* Stanza UI kit — PdfPane: rendered paper with addressable blocks + the
   left margin rail. Each edit task is a card in the margin, vertically
   aligned with its block (collision-stacked), so parallel Claude tasks
   are each visible: compose → busy → review, in place. */
(function () {
  const {
    IconButton,
    SegmentedControl,
    Button,
    BlockTag,
    DiffHunk,
    Kbd
  } = window.StanzaDesignSystem_d6c63d;
  const I = window.Icons;
  const GLYPH = {
    section: '§',
    paragraph: '¶',
    equation: '∑',
    figure: '❏',
    table: '▦',
    citation: '†',
    title: '§'
  };
  const PAGE_W = 576; // A4 proportion (1 : √2)
  const PAGE_H = 815;
  const GAP = 16; // gap between a bubble and the page edge
  const FULL_W = 224; // left-margin width that fits a full bubble
  const CHIP_W = 116; // ...that fits a compact chip (else: pin)
  const MIN_ZOOM = 0.4,
    MAX_ZOOM = 1.6;
  function blockLabel(b) {
    if (b.kind === 'section') return b.text.replace(/^\d+\s+/, '');
    if (b.kind === 'equation') return `eq (${b.num})`;
    if (b.kind === 'title') return 'Title';
    const map = {
      's1-p1': 'Opening paragraph',
      abstract: 'Abstract',
      authors: 'Authors',
      affil: 'Affiliation'
    };
    return map[b.id] || 'Paragraph';
  }

  // Combined span for a multi-block (section) task: "main.tex:24–31"
  function combineSpan(blocks) {
    const file = blocks[0].file.split('/').pop();
    const nums = blocks.flatMap(b => String(b.span).split('–').map(s => parseInt(s, 10))).filter(n => !isNaN(n));
    return `${file}:${Math.min(...nums)}–${Math.max(...nums)}`;
  }

  // Per-state color: blue = draft · clay = editing · green = proposal ready.
  function phaseTone(phase) {
    if (phase === 'review') return {
      accent: 'var(--add-600)',
      tint: 'var(--add-bg)',
      wash: 'rgba(60,138,93,0.13)',
      edge: 'rgba(60,138,93,0.5)'
    };
    if (phase === 'busy') return {
      accent: 'var(--clay-400)',
      tint: 'var(--clay-50)',
      wash: 'var(--select-fill)',
      edge: 'var(--select-edge)'
    };
    return {
      accent: 'var(--blue-500)',
      tint: 'var(--blue-50)',
      wash: 'rgba(61,110,156,0.10)',
      edge: 'rgba(61,110,156,0.45)'
    };
  }
  function Block({
    b,
    mark,
    hovered,
    onEnter,
    onLeave,
    onClick,
    refCb
  }) {
    const locked = mark && (mark.phase === 'busy' || mark.phase === 'review');
    const base = {
      position: 'relative',
      cursor: mark && mark.phase === 'busy' ? 'progress' : 'pointer',
      borderRadius: 'var(--radius-sm)',
      transition: 'background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
      boxShadow: 'none',
      background: 'transparent'
    };
    let inner = null;
    const serif = 'var(--font-serif)';
    if (b.kind === 'title') {
      inner = /*#__PURE__*/React.createElement("div", {
        style: {
          font: `var(--weight-semibold) 20px/1.18 ${serif}`,
          color: 'var(--ink-900)',
          textAlign: 'center',
          letterSpacing: '-0.01em'
        }
      }, b.text);
    } else if (b.kind === 'section' && b.heading) {
      inner = /*#__PURE__*/React.createElement("div", {
        style: {
          font: `var(--weight-semibold) 12.5px/1.3 ${serif}`,
          color: 'var(--ink-900)',
          textAlign: 'center'
        }
      }, b.text);
    } else if (b.kind === 'section') {
      inner = /*#__PURE__*/React.createElement("div", {
        style: {
          font: `var(--weight-semibold) 14px/1.3 ${serif}`,
          color: 'var(--ink-900)'
        }
      }, b.text);
    } else if (b.kind === 'equation') {
      inner = /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: '4px 0'
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          font: `italic var(--weight-regular) 13.5px/1.5 ${serif}`,
          color: 'var(--ink-900)'
        },
        dangerouslySetInnerHTML: {
          __html: b.text.replace(/\\mathcal\{B\}/g, '\u212C').replace(/\\textsf\{(\w+)\}/g, '<span style="font-style:normal">$1</span>').replace(/\\longmapsto/g, '\u27FC').replace(/\\,|\\;/g, ' ').replace(/\\ell/g, '\u2113')
        }
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          font: `13px/1 ${serif}`,
          color: 'var(--ink-500)'
        }
      }, "(", b.num, ")"));
    } else {
      const indent = b.id === 's1-p1' || b.id === 's2-p1' ? '1.4em' : '0';
      inner = /*#__PURE__*/React.createElement("div", {
        style: {
          font: `var(--weight-regular) 12px/1.5 ${serif}`,
          color: b.id === 'affil' ? 'var(--ink-500)' : 'var(--ink-900)',
          textAlign: b.id === 'authors' || b.id === 'affil' ? 'center' : 'justify',
          textIndent: indent,
          fontStyle: b.id === 'affil' ? 'italic' : 'normal'
        }
      }, b.text);
    }
    return /*#__PURE__*/React.createElement("div", {
      ref: refCb,
      onMouseEnter: onEnter,
      onMouseLeave: onLeave,
      onClick: onClick,
      style: {
        ...base,
        padding: '5px 10px',
        margin: '0 -10px'
      }
    }, hovered && !mark && /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: -9,
        left: -1,
        zIndex: 2,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 17,
        padding: '0 6px',
        background: 'var(--ink-700)',
        color: '#fff',
        borderRadius: 'var(--radius-pill)',
        font: 'var(--weight-semibold) 9.5px/1 var(--font-sans)',
        letterSpacing: '0.02em',
        boxShadow: 'var(--shadow-sm)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-serif)',
        fontSize: 11
      }
    }, GLYPH[b.kind] || '§'), `${b.file.split('/').pop()}:${b.span}`), inner);
  }

  // One margin card = one Claude task. Only the ACTIVE task expands; the
  // rest collapse to one-line chips so a crowded rail stays scannable.
  function TaskCard({
    task,
    blocks,
    expanded,
    adding,
    side = 'left',
    onToggleAdding,
    onRemoveBlock,
    onActivate,
    onUpdate,
    onSubmit,
    onDismiss,
    onResolve,
    onOpenReview,
    refCb
  }) {
    const conn = side === 'right' ? {
      left: -GAP
    } : {
      right: -GAP
    };
    const taRef = React.useRef(null);
    React.useEffect(() => {
      if (expanded && task.phase === 'compose' && taRef.current) taRef.current.focus();
    }, [task.phase, expanded]);
    const phaseColor = task.phase === 'review' ? 'var(--clay-500)' : task.phase === 'busy' ? 'var(--clay-400)' : 'var(--line-ink)';
    // distinct icon per state: ✎ draft · ✦ editing · ✓ proposal ready
    const PhaseIcon = task.phase === 'review' ? I.Check : task.phase === 'busy' ? I.Sparkles : I.PenLine;
    const b0 = blocks[0];
    // a "section task" = exactly the full block set of one section
    const allPaper = window.STZ_PAPER.blocks;
    const sec = b0 && b0.sec;
    const isSection = blocks.length > 1 && sec && blocks.every(b => b.sec === sec) && allPaper.filter(b => b.sec === sec).length === blocks.length;
    const spanRef = b0 ? blocks.length > 1 ? combineSpan(blocks) : `${b0.file.split('/').pop()}:${b0.span}` : '';
    if (!expanded) {
      return /*#__PURE__*/React.createElement("div", {
        ref: refCb,
        onClick: onActivate,
        style: {
          position: 'relative',
          cursor: 'pointer'
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          height: 32,
          padding: '0 10px',
          overflow: 'hidden',
          background: task.phase === 'review' ? 'var(--clay-50)' : 'var(--surface-overlay)',
          border: `1px solid ${task.phase === 'review' ? 'var(--clay-200)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-xs)'
        }
      }, task.phase === 'busy' ? /*#__PURE__*/React.createElement("span", {
        style: {
          width: 6,
          height: 6,
          flex: '0 0 auto',
          borderRadius: '50%',
          background: 'var(--clay-400)',
          animation: 'stz-pulse 1s var(--ease-in-out) infinite'
        }
      }) : /*#__PURE__*/React.createElement(PhaseIcon, {
        size: 12,
        style: {
          color: phaseColor,
          flex: '0 0 auto'
        }
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          flex: '0 0 auto',
          font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-sans)',
          color: task.phase === 'review' ? 'var(--clay-700)' : 'var(--ink-600)',
          whiteSpace: 'nowrap'
        }
      }, task.phase === 'review' ? 'Proposal ready' : task.phase === 'busy' ? 'Editing…' : 'Draft edit'), /*#__PURE__*/React.createElement("span", {
        style: {
          flex: 1,
          minWidth: 0,
          font: 'var(--text-2xs)/1.3 var(--font-mono)',
          color: 'var(--ink-400)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontStyle: task.instruction ? 'italic' : 'normal'
        }
      }, task.instruction ? `“${task.instruction}”` : spanRef)));
    }
    return /*#__PURE__*/React.createElement("div", {
      ref: refCb,
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--surface-overlay)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        padding: 10,
        animation: 'stz-fade-up 180ms var(--ease-out)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement(PhaseIcon, {
      size: 13,
      style: {
        color: phaseColor,
        flex: '0 0 auto'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-sans)',
        color: 'var(--ink-800)',
        letterSpacing: 'var(--tracking-caps)',
        textTransform: 'uppercase'
      }
    }, task.phase === 'review' ? 'Proposed change' : task.phase === 'busy' ? 'Editing' : 'Edit with Claude'), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), task.phase !== 'busy' && /*#__PURE__*/React.createElement(IconButton, {
      size: "sm",
      label: "Dismiss",
      onClick: onDismiss
    }, /*#__PURE__*/React.createElement(I.X, {
      size: 13
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 5,
        marginBottom: 8
      }
    }, isSection ? /*#__PURE__*/React.createElement(BlockTag, {
      kind: "section",
      label: blockLabel(blocks.find(b => b.kind === 'section') || blocks[0]),
      span: spanRef,
      active: true,
      onRemove: task.phase === 'compose' ? onDismiss : undefined
    }) : blocks.map(b => /*#__PURE__*/React.createElement(BlockTag, {
      key: b.id,
      kind: b.kind === 'title' ? 'section' : b.kind,
      label: blockLabel(b),
      span: `${b.file.split('/').pop()}:${b.span}`,
      active: true,
      onRemove: task.phase === 'compose' ? () => onRemoveBlock(b.id) : undefined
    })), task.phase === 'compose' && /*#__PURE__*/React.createElement("button", {
      onClick: onToggleAdding,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 22,
        padding: '0 8px',
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
        border: `1px ${adding ? 'solid var(--clay-400)' : 'dashed var(--line-ink)'}`,
        background: adding ? 'var(--clay-50)' : 'transparent',
        color: adding ? 'var(--clay-700)' : 'var(--ink-500)',
        font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-sans)'
      }
    }, /*#__PURE__*/React.createElement(I.Plus, {
      size: 11
    }), " blocks")), task.phase === 'compose' && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        gap: 7,
        background: 'var(--surface-card)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        padding: '6px 6px 6px 10px'
      }
    }, /*#__PURE__*/React.createElement("textarea", {
      ref: taRef,
      value: task.instruction,
      onChange: e => onUpdate({
        instruction: e.target.value
      }),
      onKeyDown: e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
        if (e.key === 'Escape') onDismiss();
      },
      rows: 2,
      placeholder: "What should change in this block\u2026",
      style: {
        flex: 1,
        resize: 'none',
        border: 'none',
        outline: 'none',
        background: 'transparent',
        font: 'var(--weight-regular) var(--text-sm)/1.45 var(--font-sans)',
        color: 'var(--ink-900)',
        maxHeight: 84,
        padding: '3px 0'
      }
    }), /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: "primary",
      disabled: !task.instruction.trim(),
      onClick: onSubmit,
      iconLeft: /*#__PURE__*/React.createElement(I.ArrowUp, {
        size: 13
      })
    }, "Run")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginTop: 6,
        paddingLeft: 1,
        flexWrap: 'wrap'
      }
    }, adding ? /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-medium) var(--text-2xs)/1.4 var(--font-sans)',
        color: 'var(--clay-600)'
      }
    }, "Click blocks in the page to add them \xB7") : /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1.4 var(--font-sans)',
        color: 'var(--ink-400)'
      }
    }, /*#__PURE__*/React.createElement(Kbd, null, "\u21E7"), " click \u2014 add block \xB7"), /*#__PURE__*/React.createElement(Kbd, null, "\u21B5"), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-sans)',
        color: 'var(--ink-400)'
      }
    }, "run \xB7"), /*#__PURE__*/React.createElement(Kbd, null, "esc"), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-sans)',
        color: 'var(--ink-400)'
      }
    }, "dismiss"))), task.phase === 'busy' && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'italic var(--weight-regular) var(--text-sm)/1.45 var(--font-serif)',
        color: 'var(--ink-600)',
        marginBottom: 8
      }
    }, "\u201C", task.instruction, "\u201D"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 4
      }
    }, [0, 1, 2].map(n => /*#__PURE__*/React.createElement("span", {
      key: n,
      style: {
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: 'var(--clay-400)',
        animation: `stz-pulse 1s ${n * 0.16}s var(--ease-in-out) infinite`
      }
    }))), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-mono)',
        color: 'var(--ink-400)'
      }
    }, "claude -p \xB7 ", blocks[0] ? blocks[0].file : ''))), task.phase === 'review' && (() => {
      const ls = (task.proposal.diff || '').split('\n');
      let a = 0,
        d = 0;
      for (const l of ls) {
        if (l[0] === '+' && l[1] !== '+') a++;else if (l[0] === '-' && l[1] !== '-') d++;
      }
      return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          font: 'var(--text-sm)/1.5 var(--font-sans)',
          color: 'var(--ink-600)',
          margin: '0 1px 9px'
        }
      }, task.proposal.note), /*#__PURE__*/React.createElement("button", {
        onClick: onOpenReview,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          padding: '8px 10px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-default)',
          background: 'var(--surface-card)',
          marginBottom: 10
        }
      }, /*#__PURE__*/React.createElement(I.FileText, {
        size: 13,
        style: {
          color: 'var(--ink-400)',
          flex: '0 0 auto'
        }
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          font: 'var(--text-2xs)/1 var(--font-mono)',
          color: 'var(--ink-600)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }
      }, task.proposal.files[0]), /*#__PURE__*/React.createElement("span", {
        style: {
          display: 'inline-flex',
          gap: 7,
          marginLeft: 'auto',
          flex: '0 0 auto'
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-mono)',
          color: 'var(--add-600)'
        }
      }, "+", a), /*#__PURE__*/React.createElement("span", {
        style: {
          font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-mono)',
          color: 'var(--del-600)'
        }
      }, "\u2212", d)), /*#__PURE__*/React.createElement(I.Maximize, {
        size: 12,
        style: {
          color: 'var(--ink-400)',
          flex: '0 0 auto'
        }
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 7
        }
      }, /*#__PURE__*/React.createElement(Button, {
        size: "sm",
        variant: "primary",
        iconLeft: /*#__PURE__*/React.createElement(I.Check, {
          size: 13
        }),
        onClick: () => onResolve('accept')
      }, "Accept"), /*#__PURE__*/React.createElement(Button, {
        size: "sm",
        variant: "secondary",
        iconLeft: /*#__PURE__*/React.createElement(I.X, {
          size: 13
        }),
        onClick: () => onResolve('reject')
      }, "Reject"), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }), /*#__PURE__*/React.createElement(IconButton, {
        size: "sm",
        label: "Open full review",
        onClick: onOpenReview
      }, /*#__PURE__*/React.createElement(I.Maximize, {
        size: 14
      }))));
    })()));
  }

  // Full-screen review: the change ALREADY COMPILED — rendered current vs
  // proposed paragraphs side by side, with word-level marks. Source diff
  // available behind a toggle.
  function ReviewOverlay({
    task,
    blocks,
    onClose,
    onResolve
  }) {
    const [mode, setMode] = React.useState('compiled');
    React.useEffect(() => {
      const onKey = e => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onResolve('accept');
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);
    const p = task.proposal;
    const b0 = blocks[0];
    const MARK = {
      k: {},
      d: {
        background: 'var(--del-bg)',
        color: 'var(--del-700)',
        textDecoration: 'line-through',
        textDecorationColor: 'var(--del-600)',
        textDecorationThickness: '1px',
        borderRadius: 2,
        padding: '0 1px'
      },
      a: {
        background: 'var(--add-bg)',
        color: 'var(--add-700)',
        borderRadius: 2,
        padding: '0 1px'
      }
    };
    const Rendered = ({
      segs
    }) => /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--weight-regular) 15px/1.66 var(--font-serif)',
        color: 'var(--ink-900)',
        textAlign: 'justify',
        textIndent: '1.4em'
      }
    }, segs.map(([t, s], i) => /*#__PURE__*/React.createElement("span", {
      key: i,
      style: MARK[t]
    }, s)));
    const Pane = ({
      eyebrow,
      hint,
      segs,
      accent
    }) => /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 7,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)',
        letterSpacing: 'var(--tracking-caps)',
        textTransform: 'uppercase',
        color: accent || 'var(--ink-400)'
      }
    }, eyebrow), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-mono)',
        color: 'var(--ink-300)'
      }
    }, hint)), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--paper-2)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-page)',
        padding: '22px 24px'
      }
    }, /*#__PURE__*/React.createElement(Rendered, {
      segs: segs
    })));
    return /*#__PURE__*/React.createElement("div", {
      onClick: onClose,
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(33, 30, 25, 0.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'stz-fade-up 160ms var(--ease-out)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      onClick: e => e.stopPropagation(),
      style: {
        width: 'min(880px, 92vw)',
        maxHeight: '86vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--paper-1)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-xl)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '13px 16px',
        borderBottom: '1px solid var(--border-default)'
      }
    }, /*#__PURE__*/React.createElement(I.Sparkles, {
      size: 15,
      style: {
        color: 'var(--clay-500)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-semibold) var(--text-base)/1 var(--font-sans)',
        color: 'var(--ink-900)'
      }
    }, "Review change"), b0 && /*#__PURE__*/React.createElement(BlockTag, {
      kind: blocks.length > 1 ? 'section' : b0.kind,
      label: blocks.length > 1 ? blockLabel(blocks.find(b => b.kind === 'section') || b0) : blockLabel(b0),
      span: blocks.length > 1 ? combineSpan(blocks) : `${b0.file.split('/').pop()}:${b0.span}`,
      active: true
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(SegmentedControl, {
      size: "sm",
      value: mode,
      onChange: setMode,
      options: [{
        value: 'compiled',
        label: 'Compiled'
      }, {
        value: 'source',
        label: 'Source'
      }]
    }), /*#__PURE__*/React.createElement(IconButton, {
      size: "sm",
      label: "Close",
      onClick: onClose
    }, /*#__PURE__*/React.createElement(I.X, {
      size: 15
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflow: 'auto',
        padding: 18
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--text-sm)/1.5 var(--font-sans)',
        color: 'var(--ink-600)',
        marginBottom: 14
      }
    }, p.note), mode === 'compiled' ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 16
      }
    }, /*#__PURE__*/React.createElement(Pane, {
      eyebrow: "Current",
      hint: "main.pdf",
      segs: p.before
    }), /*#__PURE__*/React.createElement(Pane, {
      eyebrow: "Proposed",
      hint: "after recompile",
      segs: p.after,
      accent: "var(--clay-600)"
    })) : /*#__PURE__*/React.createElement(DiffHunk, {
      file: p.files[0],
      diff: p.diff
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 16px',
        borderTop: '1px solid var(--border-default)',
        background: 'var(--surface-app)',
        borderRadius: '0 0 var(--radius-xl) var(--radius-xl)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-mono)',
        color: 'var(--ink-400)'
      }
    }, "claude -p \xB7 ", p.files[0]), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 4,
        alignItems: 'center',
        marginRight: 6
      }
    }, /*#__PURE__*/React.createElement(Kbd, null, "\u2318"), /*#__PURE__*/React.createElement(Kbd, null, "\u21B5")), /*#__PURE__*/React.createElement(Button, {
      size: "md",
      variant: "secondary",
      iconLeft: /*#__PURE__*/React.createElement(I.X, {
        size: 14
      }),
      onClick: () => onResolve('reject')
    }, "Reject"), /*#__PURE__*/React.createElement(Button, {
      size: "md",
      variant: "primary",
      iconLeft: /*#__PURE__*/React.createElement(I.Check, {
        size: 14
      }),
      onClick: () => onResolve('accept')
    }, "Accept"))));
  }
  function PdfPane({
    paper,
    tasks,
    blocksOf,
    activeTask,
    onActivateTask,
    adding,
    onToggleAdding,
    onRemoveBlockFromTask,
    selected,
    onToggleBlock,
    view,
    onView,
    onUpdateTask,
    onSubmitTask,
    onDismissTask,
    onResolveTask
  }) {
    const [hover, setHover] = React.useState(null);
    const [reviewId, setReviewId] = React.useState(null);
    const [openIds, setOpenIds] = React.useState([]);
    const [zoom, setZoom] = React.useState(1);
    const [containerW, setContainerW] = React.useState(900);
    const [pageNatH, setPageNatH] = React.useState(0);
    const [tops, setTops] = React.useState({});
    const [anchors, setAnchors] = React.useState({});
    const [selRects, setSelRects] = React.useState([]);
    const [fontsReady, setFontsReady] = React.useState(0);
    const reviewTask = tasks.find(t => t.id === reviewId && t.phase === 'review');
    const marks = {};
    for (const t of tasks) for (const id of t.blockIds) marks[id] = {
      phase: t.phase,
      active: t.id === activeTask,
      taskId: t.id
    };
    const scrollRef = React.useRef(null);
    const pageRef = React.useRef(null);
    const blockEls = React.useRef({});
    const cardEls = React.useRef({});
    const didFit = React.useRef(false);
    const autoOpened = React.useRef(new Set());
    const RAIL = 326,
      GAPX = 30,
      PAD = 28;
    React.useLayoutEffect(() => {
      const sc = scrollRef.current;
      if (!sc || typeof ResizeObserver === 'undefined') return;
      const measure = () => {
        setContainerW(sc.clientWidth);
        if (pageRef.current) setPageNatH(pageRef.current.offsetHeight);
      };
      if (!didFit.current) {
        didFit.current = true;
        const z = Math.max(MIN_ZOOM, Math.min(1, (sc.clientWidth - RAIL - GAPX - PAD * 2 - 40) / PAGE_W));
        setZoom(z);
      }
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(sc);
      if (pageRef.current) ro.observe(pageRef.current);
      return () => ro.disconnect();
    }, []);

    // Stack cards in the rail, aligned to their blocks; keep each block's own
    // y (anchor) for the connector line.
    // Stack only the OPEN cards (collision); keep every block's y (anchor) for
    // icon placement and connector starts.
    React.useLayoutEffect(() => {
      const anc = {};
      for (const t of tasks) {
        const el = blockEls.current[t.blockIds[0]];
        anc[t.id] = el ? el.offsetTop * zoom : 0;
      }
      const ideal = tasks.filter(t => openIds.includes(t.id)).map(t => ({
        id: t.id,
        top: anc[t.id]
      })).sort((a, b) => a.top - b.top);
      let cursor = 0;
      const next = {};
      for (const it of ideal) {
        const h = cardEls.current[it.id] && cardEls.current[it.id].offsetHeight || 90;
        const top = Math.max(it.top, cursor);
        next[it.id] = top;
        cursor = top + h + 14;
      }
      setTops(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
      setAnchors(prev => JSON.stringify(prev) === JSON.stringify(anc) ? prev : anc);

      // Selection overlay rects: one per contiguous run of same-task blocks,
      // measured from the live block positions so the PDF itself never changes.
      const rects = [];
      let gi = 0;
      while (gi < paper.blocks.length) {
        const m0 = marks[paper.blocks[gi].id];
        if (m0) {
          let gj = gi,
            top = null,
            bottom = null;
          while (gj < paper.blocks.length && marks[paper.blocks[gj].id] && marks[paper.blocks[gj].id].taskId === m0.taskId) {
            const el = blockEls.current[paper.blocks[gj].id];
            if (el) {
              const t = el.offsetTop,
                bt = el.offsetTop + el.offsetHeight;
              if (top === null || t < top) top = t;
              if (bottom === null || bt > bottom) bottom = bt;
            }
            gj++;
          }
          if (top !== null) rects.push({
            key: m0.taskId + '@' + gi,
            taskId: m0.taskId,
            phase: m0.phase,
            active: m0.active,
            top,
            height: bottom - top
          });
          gi = gj;
        } else gi++;
      }
      setSelRects(prev => JSON.stringify(prev) === JSON.stringify(rects) ? prev : rects);
    }, [zoom, tasks, pageNatH, containerW, openIds, activeTask, fontsReady]);

    // The page has a fixed height, so its ResizeObserver never fires when the
    // webfont swaps in and the blocks reflow — re-measure once fonts are ready.
    React.useLayoutEffect(() => {
      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => setFontsReady(n => n + 1));
      }
    }, []);
    const zoomBy = d => setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(z + d).toFixed(2))));

    // A draft (compose) opens ONCE on creation so it's editable; after that the
    // user can freely collapse it.
    React.useLayoutEffect(() => {
      const fresh = tasks.filter(t => t.phase === 'compose' && !autoOpened.current.has(t.id));
      if (fresh.length) {
        fresh.forEach(c => autoOpened.current.add(c.id));
        setOpenIds(s => [...s, ...fresh.map(c => c.id).filter(id => !s.includes(id))]);
      }
    });

    // Consistent at every zoom: each task is a clear icon badge pinned to the

    const pageW = PAGE_W * zoom,
      pageH = (pageNatH || PAGE_H) * zoom;
    const pageLeft = Math.max(PAD, (containerW - pageW) / 2); // centered in the pane
    const pageRightX = pageLeft + pageW;
    const railLeft = pageRightX + GAPX;
    const cW = Math.max(containerW, railLeft + RAIL + PAD);
    const contentH = Math.max(pageH + PAD * 2, 240);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-canvas)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 'var(--rail-toolbar)',
        flex: '0 0 auto',
        padding: '0 14px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--surface-app)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)',
        color: 'var(--ink-500)',
        letterSpacing: 'var(--tracking-caps)',
        textTransform: 'uppercase'
      }
    }, "Preview"), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-xs)/1 var(--font-mono)',
        color: 'var(--ink-400)'
      }
    }, "main.pdf"), tasks.length > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-sans)',
        color: 'var(--clay-600)',
        background: 'var(--clay-50)',
        padding: '3px 8px',
        borderRadius: 'var(--radius-pill)'
      }
    }, tasks.length, " task", tasks.length > 1 ? 's' : ''), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(SegmentedControl, {
      size: "sm",
      value: view,
      onChange: onView,
      options: [{
        value: 'read',
        label: 'Read'
      }, {
        value: 'select',
        label: 'Select blocks'
      }]
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        marginLeft: 4
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      size: "sm",
      label: "Zoom out",
      onClick: () => zoomBy(-0.1)
    }, /*#__PURE__*/React.createElement(I.ZoomOut, {
      size: 15
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-mono)',
        color: 'var(--ink-400)',
        width: 38,
        textAlign: 'center'
      }
    }, Math.round(zoom * 100), "%"), /*#__PURE__*/React.createElement(IconButton, {
      size: "sm",
      label: "Zoom in",
      onClick: () => zoomBy(0.1)
    }, /*#__PURE__*/React.createElement(I.ZoomIn, {
      size: 15
    })))), /*#__PURE__*/React.createElement("div", {
      ref: scrollRef,
      style: {
        flex: 1,
        overflow: 'auto',
        background: 'var(--surface-canvas)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        width: cW,
        height: contentH,
        minHeight: '100%'
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: cW,
      height: contentH,
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        overflow: 'visible'
      }
    }, tasks.filter(t => openIds.includes(t.id)).map(t => {
      const tn = phaseTone(t.phase);
      const by = PAD + (anchors[t.id] ?? 0) + 12;
      const cy = PAD + (tops[t.id] ?? 0) + 22;
      const mx = pageRightX + (railLeft - pageRightX) / 2;
      return /*#__PURE__*/React.createElement("path", {
        key: t.id,
        d: `M ${pageRightX} ${by} C ${mx} ${by}, ${mx} ${cy}, ${railLeft} ${cy}`,
        fill: "none",
        stroke: tn.accent,
        strokeWidth: 2,
        opacity: 0.7
      });
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        left: pageLeft,
        top: PAD,
        width: pageW,
        height: pageH
      }
    }, /*#__PURE__*/React.createElement("div", {
      ref: pageRef,
      style: {
        width: PAGE_W,
        height: PAGE_H,
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        background: '#fff',
        border: '1px solid var(--border-default)',
        borderRadius: 3,
        boxShadow: 'var(--shadow-page)',
        padding: '46px 52px 40px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        position: 'relative'
      }
    }, selRects.map(r => {
      const tn = phaseTone(r.phase);
      const showPill = hover && marks[hover] && marks[hover].taskId === r.taskId;
      const ptxt = r.phase === 'busy' ? 'Claude editing — locked' : r.phase === 'review' ? 'Awaiting review' : 'Editing block';
      return /*#__PURE__*/React.createElement(React.Fragment, {
        key: r.key
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          position: 'absolute',
          left: 42,
          right: 42,
          top: r.top,
          height: r.height,
          borderRadius: 'var(--radius-sm)',
          background: r.active ? tn.wash : tn.tint,
          boxShadow: r.active ? `inset 3px 0 0 ${tn.accent}, inset 0 0 0 1px ${tn.edge}` : `inset 3px 0 0 ${tn.accent}`,
          pointerEvents: 'none',
          zIndex: 0
        }
      }), showPill && /*#__PURE__*/React.createElement("span", {
        style: {
          position: 'absolute',
          left: 44,
          top: r.top - 9,
          zIndex: 2,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 17,
          padding: '0 6px',
          background: r.phase === 'busy' ? 'var(--ink-500)' : tn.accent,
          color: '#fff',
          borderRadius: 'var(--radius-pill)',
          font: 'var(--weight-semibold) 9.5px/1 var(--font-sans)',
          boxShadow: 'var(--shadow-sm)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap'
        }
      }, r.phase !== 'compose' && /*#__PURE__*/React.createElement(I.Lock, {
        size: 10
      }), ptxt));
    }), view === 'select' && hover && !marks[hover] && blockEls.current[hover] && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        left: 42,
        right: 42,
        top: blockEls.current[hover].offsetTop,
        height: blockEls.current[hover].offsetHeight,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--hover-fill)',
        boxShadow: 'inset 0 0 0 1px var(--hover-edge)',
        pointerEvents: 'none',
        zIndex: 0
      }
    }), paper.blocks.map(b => /*#__PURE__*/React.createElement(React.Fragment, {
      key: b.id
    }, /*#__PURE__*/React.createElement(Block, {
      b: b,
      mark: marks[b.id] || null,
      hovered: view === 'select' && hover === b.id,
      refCb: el => {
        blockEls.current[b.id] = el;
      },
      onEnter: () => setHover(b.id),
      onLeave: () => setHover(h => h === b.id ? null : h),
      onClick: e => view === 'select' && onToggleBlock(b.id, e)
    }), b.id === 'affil' && /*#__PURE__*/React.createElement("div", {
      style: {
        height: 1,
        background: 'var(--border-faint)',
        margin: '6px 0'
      }
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minHeight: 24
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        font: '12px/1 var(--font-serif)',
        color: 'var(--ink-300)'
      }
    }, "1"))), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: 0,
        left: 0
      }
    }, tasks.map(t => {
      const tn = phaseTone(t.phase);
      const Icon = t.phase === 'review' ? I.Check : t.phase === 'busy' ? I.Sparkles : I.PenLine;
      const label = t.phase === 'review' ? 'Proposal ready' : t.phase === 'busy' ? 'Editing…' : 'Draft edit';
      const isOpen = openIds.includes(t.id);
      return /*#__PURE__*/React.createElement("button", {
        key: t.id,
        onClick: () => setOpenIds(s => isOpen ? s.filter(x => x !== t.id) : [...s, t.id]),
        "aria-label": label,
        title: `${label}${t.instruction ? ' — ' + t.instruction : ''}`,
        style: {
          position: 'absolute',
          left: pageRightX - 13,
          top: PAD + (anchors[t.id] ?? 0),
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '2px solid var(--paper-2)',
          padding: 0,
          background: tn.accent,
          color: '#fff',
          boxShadow: isOpen ? `0 0 0 3px ${tn.edge}, var(--shadow-md)` : 'var(--shadow-md)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: isOpen ? 'scale(1.08)' : 'none',
          transition: 'top var(--dur-base, 200ms) var(--ease-out)',
          zIndex: 6,
          animation: t.phase === 'busy' ? 'stz-pulse 1.1s var(--ease-in-out) infinite' : 'none'
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        size: 14
      }));
    })), tasks.filter(t => openIds.includes(t.id)).map(t => /*#__PURE__*/React.createElement("div", {
      key: t.id,
      ref: el => {
        cardEls.current[t.id] = el;
      },
      style: {
        position: 'absolute',
        left: railLeft,
        top: PAD + (tops[t.id] ?? 0),
        width: RAIL,
        zIndex: 7,
        transition: 'top var(--dur-base, 200ms) var(--ease-out)'
      }
    }, /*#__PURE__*/React.createElement(TaskCard, {
      task: t,
      blocks: blocksOf(t),
      expanded: true,
      onActivate: () => {},
      onDismiss: () => {
        onDismissTask(t.id);
        setOpenIds(s => s.filter(x => x !== t.id));
      },
      onResolve: v => {
        onResolveTask(t.id, v);
        setOpenIds(s => s.filter(x => x !== t.id));
      },
      adding: adding,
      onToggleAdding: onToggleAdding,
      onRemoveBlock: bid => onRemoveBlockFromTask(t.id, bid),
      onUpdate: patch => onUpdateTask(t.id, patch),
      onSubmit: () => onSubmitTask(t.id),
      onOpenReview: () => setReviewId(t.id)
    }))))), reviewTask && /*#__PURE__*/React.createElement(ReviewOverlay, {
      task: reviewTask,
      blocks: blocksOf(reviewTask),
      onClose: () => setReviewId(null),
      onResolve: v => {
        setReviewId(null);
        onResolveTask(reviewTask.id, v);
      }
    }));
  }
  window.PdfPane = PdfPane;
  // Shared parts reused by the two-column pane.
  window.StanzaPdfParts = {
    Block,
    TaskCard,
    ReviewOverlay,
    blockLabel,
    combineSpan,
    GLYPH
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/stanza/PdfPane.jsx", error: String((e && e.message) || e) }); }

// ui_kits/stanza/PdfPaneTwoCol.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Stanza UI kit — PdfPaneTwoCol: two-column (NeurIPS/IEEE) paper preview.
   Same model as the single-column pane: the compiled A4 page is the hero,
   never restyled by selection. Each task is a state icon at the page edge
   (left-column → left edge, right-column → right edge); clicking opens its
   bubble in that side's rail with a connector. Selection is a pure overlay
   rectangle (contiguous same-task blocks merge into one). */
(function () {
  const {
    IconButton,
    SegmentedControl
  } = window.StanzaDesignSystem_d6c63d;
  const {
    TaskCard,
    ReviewOverlay,
    GLYPH
  } = window.StanzaPdfParts;
  const I = window.Icons;
  const PAGE_W = 648,
    PAGE_H = 916; // two-column A4 (1 : √2)
  const PAD = 50,
    COLGAP = 26;
  const RAIL = 300,
    GAPX = 26;
  const MIN_ZOOM = 0.4,
    MAX_ZOOM = 1.6;
  function phaseTone(phase) {
    if (phase === 'review') return {
      accent: 'var(--add-600)',
      tint: 'var(--add-bg)',
      wash: 'rgba(60,138,93,0.13)',
      edge: 'rgba(60,138,93,0.5)'
    };
    if (phase === 'busy') return {
      accent: 'var(--clay-400)',
      tint: 'var(--clay-50)',
      wash: 'var(--select-fill)',
      edge: 'var(--select-edge)'
    };
    return {
      accent: 'var(--blue-500)',
      tint: 'var(--blue-50)',
      wash: 'rgba(61,110,156,0.10)',
      edge: 'rgba(61,110,156,0.45)'
    };
  }
  function TwoColBlock({
    b,
    mark,
    hovered,
    onEnter,
    onLeave,
    onClick,
    refCb
  }) {
    const base = {
      position: 'relative',
      cursor: mark && mark.phase === 'busy' ? 'progress' : 'pointer',
      borderRadius: 'var(--radius-sm)',
      transition: 'background var(--dur-fast) var(--ease-out)',
      boxShadow: 'none',
      background: 'transparent'
    };
    const serif = 'var(--font-serif)';
    let inner = null;
    if (b.kind === 'title') {
      inner = /*#__PURE__*/React.createElement("div", {
        style: {
          font: `var(--weight-semibold) 23px/1.2 ${serif}`,
          color: 'var(--ink-900)',
          textAlign: 'center',
          letterSpacing: '-0.01em'
        }
      }, b.text);
    } else if (b.kind === 'authors') {
      inner = /*#__PURE__*/React.createElement("div", {
        style: {
          font: `var(--weight-medium) 13px/1.4 ${serif}`,
          color: 'var(--ink-800)',
          textAlign: 'center'
        }
      }, b.text);
    } else if (b.kind === 'affil') {
      inner = /*#__PURE__*/React.createElement("div", {
        style: {
          font: `italic var(--weight-regular) 11.5px/1.4 ${serif}`,
          color: 'var(--ink-500)',
          textAlign: 'center'
        }
      }, b.text);
    } else if (b.kind === 'abshead') {
      inner = /*#__PURE__*/React.createElement("div", {
        style: {
          font: `var(--weight-semibold) 12px/1.3 ${serif}`,
          color: 'var(--ink-900)',
          textAlign: 'center'
        }
      }, b.text);
    } else if (b.kind === 'abstract') {
      inner = /*#__PURE__*/React.createElement("div", {
        style: {
          font: `var(--weight-regular) 11.5px/1.55 ${serif}`,
          color: 'var(--ink-900)',
          textAlign: 'justify',
          padding: '0 30px'
        }
      }, b.text);
    } else if (b.kind === 'section') {
      inner = /*#__PURE__*/React.createElement("div", {
        style: {
          font: `var(--weight-semibold) 12.5px/1.3 ${serif}`,
          color: 'var(--ink-900)'
        }
      }, b.text);
    } else if (b.kind === 'equation') {
      inner = /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '3px 0'
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          font: `italic var(--weight-regular) 12.5px/1.5 ${serif}`,
          color: 'var(--ink-900)'
        }
      }, b.text), /*#__PURE__*/React.createElement("span", {
        style: {
          font: `11px/1 ${serif}`,
          color: 'var(--ink-500)'
        }
      }, "(", b.num, ")"));
    } else if (b.kind === 'figure') {
      inner = /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          height: 78,
          borderRadius: 4,
          background: 'var(--surface-well)',
          border: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 3,
          padding: 8,
          marginBottom: 6
        }
      }, [34, 48, 30, 60, 26, 70].map((h, i) => /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          flex: 1,
          height: h + '%',
          borderRadius: 1,
          background: i % 2 ? 'var(--clay-400)' : 'var(--ink-300)'
        }
      }))), /*#__PURE__*/React.createElement("div", {
        style: {
          font: `var(--weight-regular) 9.5px/1.45 ${serif}`,
          color: 'var(--ink-600)',
          textAlign: 'justify'
        }
      }, b.text));
    } else {
      inner = /*#__PURE__*/React.createElement("div", {
        style: {
          font: `var(--weight-regular) 10.5px/1.5 ${serif}`,
          color: 'var(--ink-900)',
          textAlign: 'justify'
        }
      }, b.text);
    }
    return /*#__PURE__*/React.createElement("div", {
      ref: refCb,
      onMouseEnter: onEnter,
      onMouseLeave: onLeave,
      onClick: onClick,
      style: {
        ...base,
        padding: '4px 9px',
        margin: '0 -9px'
      }
    }, hovered && !mark && /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: -9,
        left: -1,
        zIndex: 2,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 16,
        padding: '0 6px',
        background: 'var(--ink-700)',
        color: '#fff',
        borderRadius: 'var(--radius-pill)',
        font: 'var(--weight-semibold) 9px/1 var(--font-sans)',
        boxShadow: 'var(--shadow-sm)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-serif)',
        fontSize: 10
      }
    }, GLYPH[b.kind] || '§'), `${b.file.split('/').pop()}:${b.span}`), inner);
  }
  function PdfPaneTwoCol({
    paper,
    tasks,
    blocksOf,
    activeTask,
    onActivateTask,
    adding,
    onToggleAdding,
    onRemoveBlockFromTask,
    selected,
    onToggleBlock,
    view,
    onView,
    onUpdateTask,
    onSubmitTask,
    onDismissTask,
    onResolveTask
  }) {
    const [hover, setHover] = React.useState(null);
    const [reviewId, setReviewId] = React.useState(null);
    const [openIds, setOpenIds] = React.useState([]);
    const [zoom, setZoom] = React.useState(1);
    const [containerW, setContainerW] = React.useState(1100);
    const [pageNatH, setPageNatH] = React.useState(0);
    const [tops, setTops] = React.useState({});
    const [anchors, setAnchors] = React.useState({});
    const [selRects, setSelRects] = React.useState([]);
    const [fontsReady, setFontsReady] = React.useState(0);
    const reviewTask = tasks.find(t => t.id === reviewId && t.phase === 'review');
    const scrollRef = React.useRef(null);
    const pageRef = React.useRef(null);
    const blockEls = React.useRef({});
    const cardEls = React.useRef({});
    const didFit = React.useRef(false);
    const autoOpened = React.useRef(new Set());
    const colOf = id => (paper.blocks.find(b => b.id === id) || {}).col;
    const sides = {};
    let lc = 0,
      rc = 0;
    for (const t of tasks) {
      const c = colOf(t.blockIds[0]);
      if (c === 'l') {
        sides[t.id] = 'left';
        lc++;
      } else if (c === 'r') {
        sides[t.id] = 'right';
        rc++;
      }
    }
    for (const t of tasks) {
      if (sides[t.id]) continue;
      if (lc <= rc) {
        sides[t.id] = 'left';
        lc++;
      } else {
        sides[t.id] = 'right';
        rc++;
      }
    }
    const marks = {};
    for (const t of tasks) for (const id of t.blockIds) marks[id] = {
      phase: t.phase,
      active: t.id === activeTask,
      side: sides[t.id],
      taskId: t.id
    };
    React.useLayoutEffect(() => {
      const sc = scrollRef.current;
      if (!sc || typeof ResizeObserver === 'undefined') return;
      const measure = () => {
        setContainerW(sc.clientWidth);
        if (pageRef.current) setPageNatH(pageRef.current.offsetHeight);
      };
      if (!didFit.current) {
        didFit.current = true;
        setZoom(Math.max(MIN_ZOOM, Math.min(1, (sc.clientWidth - 2 * (RAIL + GAPX) - 40) / PAGE_W)));
      }
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(sc);
      if (pageRef.current) ro.observe(pageRef.current);
      return () => ro.disconnect();
    }, []);
    React.useLayoutEffect(() => {
      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(() => setFontsReady(n => n + 1));
    }, []);
    React.useLayoutEffect(() => {
      const fresh = tasks.filter(t => t.phase === 'compose' && !autoOpened.current.has(t.id));
      if (fresh.length) {
        fresh.forEach(c => autoOpened.current.add(c.id));
        setOpenIds(s => [...s, ...fresh.map(c => c.id).filter(id => !s.includes(id))]);
      }
    });

    // Stack open cards per side; record each block's y (anchor); build the
    // selection overlay rects (one per contiguous same-task run, column-aware).
    React.useLayoutEffect(() => {
      const anc = {};
      for (const t of tasks) {
        const el = blockEls.current[t.blockIds[0]];
        anc[t.id] = el ? el.offsetTop * zoom : 0;
      }
      const next = {};
      for (const sideKey of ['left', 'right']) {
        const ideal = tasks.filter(t => openIds.includes(t.id) && sides[t.id] === sideKey).map(t => ({
          id: t.id,
          top: anc[t.id]
        })).sort((a, b) => a.top - b.top);
        let cursor = 0;
        for (const it of ideal) {
          const h = cardEls.current[it.id] && cardEls.current[it.id].offsetHeight || 90;
          const top = Math.max(it.top, cursor);
          next[it.id] = top;
          cursor = top + h + 14;
        }
      }
      const rects = [];
      let gi = 0;
      while (gi < paper.blocks.length) {
        const m0 = marks[paper.blocks[gi].id];
        if (m0) {
          let gj = gi,
            top = null,
            bottom = null,
            left = null,
            right = null;
          while (gj < paper.blocks.length && marks[paper.blocks[gj].id] && marks[paper.blocks[gj].id].taskId === m0.taskId) {
            const el = blockEls.current[paper.blocks[gj].id];
            if (el) {
              const t = el.offsetTop,
                bt = el.offsetTop + el.offsetHeight,
                l = el.offsetLeft,
                r = el.offsetLeft + el.offsetWidth;
              if (top === null || t < top) top = t;
              if (bottom === null || bt > bottom) bottom = bt;
              if (left === null || l < left) left = l;
              if (right === null || r > right) right = r;
            }
            gj++;
          }
          if (top !== null) rects.push({
            key: m0.taskId + '@' + gi,
            taskId: m0.taskId,
            phase: m0.phase,
            active: m0.active,
            top,
            height: bottom - top,
            left,
            width: right - left
          });
          gi = gj;
        } else gi++;
      }
      setTops(p => JSON.stringify(p) === JSON.stringify(next) ? p : next);
      setAnchors(p => JSON.stringify(p) === JSON.stringify(anc) ? p : anc);
      setSelRects(p => JSON.stringify(p) === JSON.stringify(rects) ? p : rects);
    }, [zoom, tasks, pageNatH, containerW, openIds, activeTask, fontsReady]);
    const zoomBy = d => setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(z + d).toFixed(2))));
    const pageW = PAGE_W * zoom,
      pageH = (pageNatH || PAGE_H) * zoom;
    const pageLeft = Math.max(RAIL + GAPX + 12, (containerW - pageW) / 2);
    const pageRightX = pageLeft + pageW;
    const leftRailRight = pageLeft - GAPX,
      leftRailLeft = leftRailRight - RAIL;
    const rightRailLeft = pageRightX + GAPX;
    const cW = Math.max(containerW, rightRailLeft + RAIL + 12);
    const contentH = Math.max(pageH + PAD * 2, 240);
    const hoveredTaskId = hover && marks[hover] ? marks[hover].taskId : null;
    const fullBlocks = paper.blocks.filter(b => b.col === 'full');
    const leftBlocks = paper.blocks.filter(b => b.col === 'l');
    const rightBlocks = paper.blocks.filter(b => b.col === 'r');
    const renderBlock = b => /*#__PURE__*/React.createElement(TwoColBlock, {
      key: b.id,
      b: b,
      mark: marks[b.id] || null,
      hovered: view === 'select' && hover === b.id,
      refCb: el => {
        blockEls.current[b.id] = el;
      },
      onEnter: () => setHover(b.id),
      onLeave: () => setHover(h => h === b.id ? null : h),
      onClick: e => view === 'select' && onToggleBlock(b.id, e)
    });
    const cardHandlers = t => ({
      adding,
      onToggleAdding,
      onActivate: () => {},
      onDismiss: () => {
        onDismissTask(t.id);
        setOpenIds(s => s.filter(x => x !== t.id));
      },
      onResolve: v => {
        onResolveTask(t.id, v);
        setOpenIds(s => s.filter(x => x !== t.id));
      },
      onRemoveBlock: bid => onRemoveBlockFromTask(t.id, bid),
      onUpdate: patch => onUpdateTask(t.id, patch),
      onSubmit: () => onSubmitTask(t.id),
      onOpenReview: () => setReviewId(t.id)
    });
    return /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-canvas)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 'var(--rail-toolbar)',
        flex: '0 0 auto',
        padding: '0 14px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--surface-app)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)',
        color: 'var(--ink-500)',
        letterSpacing: 'var(--tracking-caps)',
        textTransform: 'uppercase'
      }
    }, "Preview"), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-xs)/1 var(--font-mono)',
        color: 'var(--ink-400)'
      }
    }, "main.pdf \xB7 2-column"), tasks.length > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-sans)',
        color: 'var(--clay-600)',
        background: 'var(--clay-50)',
        padding: '3px 8px',
        borderRadius: 'var(--radius-pill)'
      }
    }, tasks.length, " task", tasks.length > 1 ? 's' : ''), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(SegmentedControl, {
      size: "sm",
      value: view,
      onChange: onView,
      options: [{
        value: 'read',
        label: 'Read'
      }, {
        value: 'select',
        label: 'Select blocks'
      }]
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        marginLeft: 4
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      size: "sm",
      label: "Zoom out",
      onClick: () => zoomBy(-0.1)
    }, /*#__PURE__*/React.createElement(I.ZoomOut, {
      size: 15
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-mono)',
        color: 'var(--ink-400)',
        width: 38,
        textAlign: 'center'
      }
    }, Math.round(zoom * 100), "%"), /*#__PURE__*/React.createElement(IconButton, {
      size: "sm",
      label: "Zoom in",
      onClick: () => zoomBy(0.1)
    }, /*#__PURE__*/React.createElement(I.ZoomIn, {
      size: 15
    })))), /*#__PURE__*/React.createElement("div", {
      ref: scrollRef,
      style: {
        flex: 1,
        overflow: 'auto',
        background: 'var(--surface-canvas)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        width: cW,
        height: contentH,
        minHeight: '100%'
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: cW,
      height: contentH,
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        overflow: 'visible'
      }
    }, tasks.filter(t => openIds.includes(t.id)).map(t => {
      const tn = phaseTone(t.phase);
      const onRight = sides[t.id] === 'right';
      const by = PAD + (anchors[t.id] ?? 0) + 12;
      const cy = PAD + (tops[t.id] ?? 0) + 22;
      const x1 = onRight ? pageRightX : pageLeft;
      const x2 = onRight ? rightRailLeft : leftRailRight;
      const mx = (x1 + x2) / 2;
      return /*#__PURE__*/React.createElement("path", {
        key: t.id,
        d: `M ${x1} ${by} C ${mx} ${by}, ${mx} ${cy}, ${x2} ${cy}`,
        fill: "none",
        stroke: tn.accent,
        strokeWidth: 2,
        opacity: 0.7
      });
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        left: pageLeft,
        top: PAD,
        width: pageW,
        height: pageH
      }
    }, /*#__PURE__*/React.createElement("div", {
      ref: pageRef,
      style: {
        width: PAGE_W,
        height: PAGE_H,
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        background: '#fff',
        border: '1px solid var(--border-default)',
        borderRadius: 3,
        boxShadow: 'var(--shadow-page)',
        padding: `46px ${PAD}px 40px`,
        overflow: 'hidden',
        position: 'relative'
      }
    }, selRects.map(r => {
      const tn = phaseTone(r.phase);
      const showPill = hoveredTaskId === r.taskId;
      const ptxt = r.phase === 'busy' ? 'Claude editing — locked' : r.phase === 'review' ? 'Awaiting review' : 'Editing block';
      return /*#__PURE__*/React.createElement(React.Fragment, {
        key: r.key
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          position: 'absolute',
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          borderRadius: 'var(--radius-sm)',
          background: r.active ? tn.wash : tn.tint,
          boxShadow: r.active ? `inset 3px 0 0 ${tn.accent}, inset 0 0 0 1px ${tn.edge}` : `inset 3px 0 0 ${tn.accent}`,
          pointerEvents: 'none',
          zIndex: 0
        }
      }), showPill && /*#__PURE__*/React.createElement("span", {
        style: {
          position: 'absolute',
          left: r.left + 2,
          top: r.top - 9,
          zIndex: 2,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 16,
          padding: '0 6px',
          background: r.phase === 'busy' ? 'var(--ink-500)' : tn.accent,
          color: '#fff',
          borderRadius: 'var(--radius-pill)',
          font: 'var(--weight-semibold) 9px/1 var(--font-sans)',
          boxShadow: 'var(--shadow-sm)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap'
        }
      }, r.phase !== 'compose' && /*#__PURE__*/React.createElement(I.Lock, {
        size: 9
      }), ptxt));
    }), view === 'select' && hover && !marks[hover] && blockEls.current[hover] && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        left: blockEls.current[hover].offsetLeft,
        top: blockEls.current[hover].offsetTop,
        width: blockEls.current[hover].offsetWidth,
        height: blockEls.current[hover].offsetHeight,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--hover-fill)',
        boxShadow: 'inset 0 0 0 1px var(--hover-edge)',
        pointerEvents: 'none',
        zIndex: 0
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginBottom: 14
      }
    }, fullBlocks.map(renderBlock)), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 1,
        background: 'var(--border-faint)',
        margin: '0 0 14px'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: COLGAP,
        alignItems: 'flex-start'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 9
      }
    }, leftBlocks.map(renderBlock)), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 9
      }
    }, rightBlocks.map(renderBlock))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 16,
        textAlign: 'center',
        font: '12px/1 var(--font-serif)',
        color: 'var(--ink-300)'
      }
    }, "1"))), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: 0,
        left: 0
      }
    }, tasks.map(t => {
      const tn = phaseTone(t.phase);
      const onRight = sides[t.id] === 'right';
      const Icon = t.phase === 'review' ? I.Check : t.phase === 'busy' ? I.Sparkles : I.PenLine;
      const label = t.phase === 'review' ? 'Proposal ready' : t.phase === 'busy' ? 'Editing…' : 'Draft edit';
      const isOpen = openIds.includes(t.id);
      const x = (onRight ? pageRightX : pageLeft) - 13;
      return /*#__PURE__*/React.createElement("button", {
        key: t.id,
        onClick: () => setOpenIds(s => isOpen ? s.filter(y => y !== t.id) : [...s, t.id]),
        "aria-label": label,
        title: `${label}${t.instruction ? ' — ' + t.instruction : ''}`,
        style: {
          position: 'absolute',
          left: x,
          top: PAD + (anchors[t.id] ?? 0),
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '2px solid var(--paper-2)',
          padding: 0,
          background: tn.accent,
          color: '#fff',
          boxShadow: isOpen ? `0 0 0 3px ${tn.edge}, var(--shadow-md)` : 'var(--shadow-md)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: isOpen ? 'scale(1.08)' : 'none',
          transition: 'top var(--dur-base, 200ms) var(--ease-out)',
          zIndex: 6,
          animation: t.phase === 'busy' ? 'stz-pulse 1.1s var(--ease-in-out) infinite' : 'none'
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        size: 14
      }));
    })), tasks.filter(t => openIds.includes(t.id)).map(t => {
      const onRight = sides[t.id] === 'right';
      return /*#__PURE__*/React.createElement("div", {
        key: t.id,
        ref: el => {
          cardEls.current[t.id] = el;
        },
        style: {
          position: 'absolute',
          left: onRight ? rightRailLeft : leftRailLeft,
          top: PAD + (tops[t.id] ?? 0),
          width: RAIL,
          zIndex: 7,
          transition: 'top var(--dur-base, 200ms) var(--ease-out)'
        }
      }, /*#__PURE__*/React.createElement(TaskCard, _extends({
        task: t,
        blocks: blocksOf(t),
        side: sides[t.id],
        expanded: true
      }, cardHandlers(t))));
    }))), reviewTask && /*#__PURE__*/React.createElement(ReviewOverlay, {
      task: reviewTask,
      blocks: blocksOf(reviewTask),
      onClose: () => setReviewId(null),
      onResolve: v => {
        setReviewId(null);
        onResolveTask(reviewTask.id, v);
      }
    }));
  }
  window.PdfPaneTwoCol = PdfPaneTwoCol;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/stanza/PdfPaneTwoCol.jsx", error: String((e && e.message) || e) }); }

// ui_kits/stanza/Sidebar.jsx
try { (() => {
/* Stanza UI kit — Sidebar (files + block outline + history) */
(function () {
  const I = window.Icons;
  function SectionLabel({
    children,
    icon
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 4px 6px',
        color: 'var(--ink-400)'
      }
    }, icon, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)',
        letterSpacing: 'var(--tracking-caps)',
        textTransform: 'uppercase'
      }
    }, children));
  }

  /* Right-click menu — floats at the cursor, closes on outside click / Esc / scroll. */
  function ContextMenu({
    x,
    y,
    items,
    onClose
  }) {
    const ref = React.useRef(null);
    const [pos, setPos] = React.useState({
      left: x,
      top: y
    });
    React.useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const pad = 8;
      setPos({
        left: Math.min(x, window.innerWidth - r.width - pad),
        top: Math.min(y, window.innerHeight - r.height - pad)
      });
    }, [x, y]);
    React.useEffect(() => {
      const close = () => onClose();
      const key = e => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('mousedown', close);
      window.addEventListener('resize', close);
      window.addEventListener('blur', close);
      document.addEventListener('keydown', key);
      window.addEventListener('scroll', close, true);
      return () => {
        window.removeEventListener('mousedown', close);
        window.removeEventListener('resize', close);
        window.removeEventListener('blur', close);
        document.removeEventListener('keydown', key);
        window.removeEventListener('scroll', close, true);
      };
    }, []);
    return /*#__PURE__*/React.createElement("div", {
      ref: ref,
      onMouseDown: e => e.stopPropagation(),
      style: {
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        zIndex: 200,
        minWidth: 184,
        padding: 5,
        background: 'var(--surface-card)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xl)',
        animation: 'stz-fade-up 110ms var(--ease-out)'
      }
    }, items.map((it, i) => it.sep ? /*#__PURE__*/React.createElement("div", {
      key: 's' + i,
      style: {
        height: 1,
        background: 'var(--border-faint)',
        margin: '5px 6px'
      }
    }) : /*#__PURE__*/React.createElement(MenuItem, {
      key: it.label,
      item: it,
      onClose: onClose
    })));
  }
  function MenuItem({
    item,
    onClose
  }) {
    const [hover, setHover] = React.useState(false);
    const danger = item.danger;
    const fg = danger ? 'var(--del-600)' : 'var(--ink-700)';
    return /*#__PURE__*/React.createElement("button", {
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      onClick: () => {
        item.onClick();
        onClose();
      },
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        textAlign: 'left',
        padding: '7px 9px',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        background: hover ? danger ? 'var(--del-bg)' : 'var(--hover-fill)' : 'transparent',
        color: fg,
        font: 'var(--weight-medium) var(--text-sm)/1 var(--font-sans)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: '0 0 auto',
        display: 'inline-flex',
        color: danger ? 'var(--del-600)' : 'var(--ink-400)'
      }
    }, item.icon), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, item.label), item.kbd && /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-mono)',
        color: 'var(--ink-300)'
      }
    }, item.kbd));
  }
  function Row({
    icon,
    label,
    meta,
    active,
    indent = 0,
    accent,
    onClick,
    onContextMenu,
    menuOpen,
    renaming,
    onRenameCommit,
    onRenameCancel
  }) {
    const [hover, setHover] = React.useState(false);
    const inputRef = React.useRef(null);
    React.useEffect(() => {
      if (renaming && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [renaming]);
    const highlight = active || menuOpen;
    return /*#__PURE__*/React.createElement("div", {
      onClick: renaming ? undefined : onClick,
      onContextMenu: onContextMenu,
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 28,
        padding: `0 8px 0 ${8 + indent * 14}px`,
        borderRadius: 'var(--radius-sm)',
        background: highlight ? 'var(--clay-50)' : hover ? 'var(--hover-fill)' : 'transparent',
        color: highlight ? 'var(--clay-700)' : 'var(--ink-600)',
        boxShadow: menuOpen ? 'inset 0 0 0 1px var(--clay-200)' : 'none',
        cursor: 'pointer',
        userSelect: 'none'
      }
    }, icon && /*#__PURE__*/React.createElement("span", {
      style: {
        flex: '0 0 auto',
        color: highlight ? 'var(--clay-500)' : accent || 'var(--ink-400)',
        display: 'inline-flex'
      }
    }, icon), renaming ? /*#__PURE__*/React.createElement("input", {
      ref: inputRef,
      defaultValue: label,
      onClick: e => e.stopPropagation(),
      onKeyDown: e => {
        if (e.key === 'Enter') onRenameCommit(e.currentTarget.value);else if (e.key === 'Escape') onRenameCancel();
      },
      onBlur: e => onRenameCommit(e.currentTarget.value),
      style: {
        flex: 1,
        minWidth: 0,
        height: 20,
        padding: '0 5px',
        margin: 0,
        border: '1px solid var(--clay-400)',
        borderRadius: 'var(--radius-sm)',
        outline: 'none',
        background: 'var(--surface-card)',
        color: 'var(--ink-900)',
        font: 'var(--weight-medium) var(--text-sm)/1 var(--font-sans)',
        boxShadow: '0 0 0 3px var(--clay-100)'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        font: `var(--weight-${active ? 'semibold' : 'medium'}) var(--text-sm)/1 var(--font-sans)`,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, label), meta && !renaming && /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-mono)',
        color: 'var(--ink-300)'
      }
    }, meta));
  }
  function fileIcon(name) {
    const I = window.Icons;
    if (/\.bib$/.test(name)) return {
      icon: /*#__PURE__*/React.createElement(I.List, {
        size: 14
      }),
      accent: 'var(--blue-500)'
    };
    if (/\.(png|jpe?g|svg)$/.test(name) || /\.pdf$/.test(name)) return {
      icon: /*#__PURE__*/React.createElement(I.Image, {
        size: 14
      }),
      accent: 'var(--ink-400)'
    };
    if (/\.(md|txt)$/.test(name)) return {
      icon: /*#__PURE__*/React.createElement(I.PenLine, {
        size: 14
      })
    };
    return {
      icon: /*#__PURE__*/React.createElement(I.FileText, {
        size: 14
      })
    };
  }
  function DirNode({
    node,
    indent,
    ctx
  }) {
    const [open, setOpen] = React.useState(node.open ?? false);
    const I = window.Icons;
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Row, {
      indent: indent,
      icon: /*#__PURE__*/React.createElement("span", {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3
        }
      }, open ? /*#__PURE__*/React.createElement(I.ChevronDown, {
        size: 11
      }) : /*#__PURE__*/React.createElement(I.ChevronRight, {
        size: 11
      }), /*#__PURE__*/React.createElement(I.Folder, {
        size: 14
      })),
      label: node.dir,
      meta: open ? undefined : String(node.children.length),
      menuOpen: ctx.menuNode === node,
      renaming: ctx.renaming === node,
      onRenameCommit: v => ctx.commitRename(node, v),
      onRenameCancel: ctx.cancelRename,
      onContextMenu: e => ctx.openMenu(e, node, 'dir'),
      onClick: () => setOpen(o => !o)
    }), open && node.children.map(c => /*#__PURE__*/React.createElement(FileNode, {
      key: c.path || c.dir,
      node: c,
      indent: indent + 1,
      ctx: ctx
    })));
  }
  function FileNode({
    node,
    indent = 0,
    ctx
  }) {
    if (node.dir) return /*#__PURE__*/React.createElement(DirNode, {
      node: node,
      indent: indent,
      ctx: ctx
    });
    const name = node.path.split('/').pop();
    const {
      icon,
      accent
    } = fileIcon(name);
    return /*#__PURE__*/React.createElement(Row, {
      indent: indent,
      icon: icon,
      label: name,
      active: ctx.activeFile === node.path,
      accent: accent,
      menuOpen: ctx.menuNode === node,
      renaming: ctx.renaming === node,
      onRenameCommit: v => ctx.commitRename(node, v),
      onRenameCancel: ctx.cancelRename,
      onContextMenu: e => ctx.openMenu(e, node, 'file'),
      onClick: () => ctx.onOpenFile && ctx.onOpenFile(node.path)
    });
  }
  function Sidebar({
    paper,
    files,
    activeFile,
    onOpenFile,
    onNewFile,
    onNewFolder,
    onCollapse,
    activeBlock,
    onPickBlock,
    onRenameNode,
    onDuplicateNode,
    onDeleteNode
  }) {
    const outline = paper.blocks.filter(b => b.kind === 'section' && !b.heading);
    const tree = files || paper.files;
    const [menu, setMenu] = React.useState(null); // { x, y, node, kind }
    const [renaming, setRenaming] = React.useState(null); // node being renamed

    const openMenu = (e, node, kind) => {
      e.preventDefault();
      e.stopPropagation();
      setRenaming(null);
      setMenu({
        x: e.clientX,
        y: e.clientY,
        node,
        kind
      });
    };
    const closeMenu = () => setMenu(null);
    const commitRename = (node, value) => {
      const v = (value || '').trim();
      const current = node.dir || node.path.split('/').pop();
      if (v && v !== current && onRenameNode) onRenameNode(node, v);
      setRenaming(null);
    };
    const cancelRename = () => setRenaming(null);
    const copyPath = node => {
      const p = node.dir || node.path;
      try {
        navigator.clipboard && navigator.clipboard.writeText(p);
      } catch (e) {}
    };
    const menuItems = (node, kind) => {
      if (kind === 'file') {
        return [{
          label: 'Open',
          icon: /*#__PURE__*/React.createElement(I.CornerUpRight, {
            size: 15
          }),
          onClick: () => onOpenFile && onOpenFile(node.path)
        }, {
          sep: true
        }, {
          label: 'Rename',
          icon: /*#__PURE__*/React.createElement(I.PenLine, {
            size: 15
          }),
          kbd: '⏎',
          onClick: () => {
            closeMenu();
            setRenaming(node);
          }
        }, {
          label: 'Duplicate',
          icon: /*#__PURE__*/React.createElement(I.Copy, {
            size: 15
          }),
          onClick: () => onDuplicateNode && onDuplicateNode(node)
        }, {
          label: 'Copy path',
          icon: /*#__PURE__*/React.createElement(I.Link, {
            size: 15
          }),
          onClick: () => copyPath(node)
        }, {
          sep: true
        }, {
          label: 'Delete',
          icon: /*#__PURE__*/React.createElement(I.Trash, {
            size: 15
          }),
          danger: true,
          onClick: () => onDeleteNode && onDeleteNode(node)
        }];
      }
      return [{
        label: 'New file',
        icon: /*#__PURE__*/React.createElement(I.Plus, {
          size: 15
        }),
        onClick: () => onNewFile && onNewFile(node)
      }, {
        label: 'New folder',
        icon: /*#__PURE__*/React.createElement(I.Folder, {
          size: 15
        }),
        onClick: () => onNewFolder && onNewFolder(node)
      }, {
        sep: true
      }, {
        label: 'Rename',
        icon: /*#__PURE__*/React.createElement(I.PenLine, {
          size: 15
        }),
        kbd: '⏎',
        onClick: () => {
          closeMenu();
          setRenaming(node);
        }
      }, {
        label: 'Copy path',
        icon: /*#__PURE__*/React.createElement(I.Link, {
          size: 15
        }),
        onClick: () => copyPath(node)
      }, {
        sep: true
      }, {
        label: 'Delete',
        icon: /*#__PURE__*/React.createElement(I.Trash, {
          size: 15
        }),
        danger: true,
        onClick: () => onDeleteNode && onDeleteNode(node)
      }];
    };
    const ctx = {
      activeFile,
      onOpenFile,
      openMenu,
      menuNode: menu && menu.node,
      renaming,
      commitRename,
      cancelRename
    };
    const addBtn = (label, icon, onClick) => /*#__PURE__*/React.createElement("button", {
      onClick: onClick,
      title: label,
      "aria-label": label,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        background: 'transparent',
        color: 'var(--ink-400)',
        cursor: 'pointer'
      }
    }, icon);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        width: 'var(--rail-sidebar)',
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-app)',
        borderRight: '1px solid var(--border-default)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '12px 12px',
        borderBottom: '1px solid var(--border-faint)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--clay-500)',
        color: 'var(--text-on-accent)'
      }
    }, /*#__PURE__*/React.createElement(I.Folder, {
      size: 15
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0,
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--weight-semibold) var(--text-sm)/1.2 var(--font-sans)',
        color: 'var(--ink-900)'
      }
    }, paper.project), /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--text-2xs)/1.2 var(--font-mono)',
        color: 'var(--ink-400)'
      }
    }, "~/papers/", paper.project)), onCollapse && /*#__PURE__*/React.createElement("button", {
      onClick: onCollapse,
      title: "Collapse sidebar",
      "aria-label": "Collapse sidebar",
      style: {
        flex: '0 0 auto',
        width: 24,
        height: 24,
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        background: 'transparent',
        color: 'var(--ink-400)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        transform: 'rotate(180deg)'
      }
    }, /*#__PURE__*/React.createElement(I.ChevronRight, {
      size: 16
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflow: 'auto',
        padding: '14px 8px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 4px 6px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: 'var(--ink-400)',
        font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)',
        letterSpacing: 'var(--tracking-caps)',
        textTransform: 'uppercase'
      }
    }, /*#__PURE__*/React.createElement(I.FileText, {
      size: 12
    }), "Files"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        gap: 2
      }
    }, addBtn('New file', /*#__PURE__*/React.createElement(I.Plus, {
      size: 13
    }), () => onNewFile && onNewFile()), addBtn('New folder', /*#__PURE__*/React.createElement(I.Folder, {
      size: 13
    }), () => onNewFolder && onNewFolder()))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 18
      }
    }, tree.map(f => /*#__PURE__*/React.createElement(FileNode, {
      key: f.path || f.dir,
      node: f,
      ctx: ctx
    }))), /*#__PURE__*/React.createElement(SectionLabel, {
      icon: /*#__PURE__*/React.createElement(I.List, {
        size: 12
      })
    }, "Outline"), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 18
      }
    }, outline.map(b => /*#__PURE__*/React.createElement(Row, {
      key: b.id,
      icon: /*#__PURE__*/React.createElement("span", {
        style: {
          font: 'var(--weight-semibold) 13px/1 var(--font-serif)'
        }
      }, "\xA7"),
      label: b.text,
      active: activeBlock === b.id,
      onClick: () => onPickBlock(b.id)
    }))), /*#__PURE__*/React.createElement(SectionLabel, {
      icon: /*#__PURE__*/React.createElement(I.History, {
        size: 12
      })
    }, "History"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Row, {
      icon: /*#__PURE__*/React.createElement(I.Commit, {
        size: 14
      }),
      label: "claude: tighten abstract",
      meta: "2m",
      accent: "var(--add-600)"
    }), /*#__PURE__*/React.createElement(Row, {
      icon: /*#__PURE__*/React.createElement(I.Commit, {
        size: 14
      }),
      label: "claude: define notation",
      meta: "14m",
      accent: "var(--add-600)"
    }), /*#__PURE__*/React.createElement(Row, {
      icon: /*#__PURE__*/React.createElement(I.Commit, {
        size: 14
      }),
      label: "wip: manual edits",
      meta: "1h"
    }))), menu && /*#__PURE__*/React.createElement(ContextMenu, {
      x: menu.x,
      y: menu.y,
      items: menuItems(menu.node, menu.kind),
      onClose: closeMenu
    }));
  }
  window.Sidebar = Sidebar;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/stanza/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/stanza/SourceEditor.jsx
try { (() => {
/* Stanza UI kit — SourceEditor: full-height .tex editor pane (Overleaf-style split).
   Renders side-by-side with the PDF preview. Syntax-colored, editable
   (contentEditable mock), with a line-number gutter and file tabs. */
(function () {
  const {
    IconButton,
    Badge
  } = window.StanzaDesignSystem_d6c63d;
  const I = window.Icons;

  // sections/intro.tex — believable full file, lightly tokenized.
  // kinds: cm = comment, cmd = command, br = brace arg, txt = prose, math = math
  const LINES = [[['cm', '% sections/intro.tex — input from main.tex']], [['cmd', '\\section'], ['br', '{Introduction}'], ['cmd', '\\label'], ['br', '{sec:intro}']], [], [['txt', 'Authors of technical documents think in terms of what they']], [['txt', 'see --- a paragraph, an equation, a figure --- not line numbers in a']], [['txt', 'source file. Yet editors force them to translate between the two,']], [['txt', 'a persistent source of friction we remove in '], ['cmd', '\\S'], ['txt', '2.']], [], [['cmd', '\\begin'], ['br', '{equation}']], [['math', '  \\mathcal{B}(p, x, y) \\;\\longmapsto\\; (\\textsf{file},\\, \\ell)']], [['math', '  '], ['cmd', '\\label'], ['br', '{eq:blockmap}']], [['cmd', '\\end'], ['br', '{equation}']], [], [['txt', 'We close this gap with a bidirectional map between rendered']], [['txt', 'coordinates and source spans~'], ['cmd', '\\eqref'], ['br', '{eq:blockmap}'], ['txt', '. A selection']], [['txt', 'in the page becomes a file-and-line pair, which resolves to the']], [['txt', 'enclosing block of the parsed tree. Edits are proposed as diffs']], [['txt', 'and reviewed in place~'], ['cmd', '\\cite'], ['br', '{fernandes2026blocks}'], ['txt', '.']]];
  const COLOR = {
    cm: 'var(--ink-400)',
    cmd: 'var(--blue-600)',
    br: 'var(--ink-500)',
    txt: 'var(--ink-800)',
    math: 'var(--clay-700)'
  };

  // Raw LaTeX per file (lightly tokenized). New/unknown files get a stub.
  const SOURCES = {
    'sections/intro.tex': LINES,
    'main.tex': [[['cmd', '\\documentclass'], ['br', '[11pt]{article}']], [['cmd', '\\usepackage'], ['br', '{amsmath, amssymb, graphicx}']], [['cmd', '\\input'], ['br', '{macros}']], [], [['cmd', '\\title'], ['br', '{Block-Addressable Editing of Structured Documents}']], [['cmd', '\\author'], ['br', '{M. Fernandes, A. Reis, J. Costa}']], [], [['cmd', '\\begin'], ['br', '{document}']], [['cmd', '\\maketitle'], ['cm', '   % title block']], [['cmd', '\\input'], ['br', '{sections/intro}']], [['cmd', '\\input'], ['br', '{sections/method}']], [['cmd', '\\input'], ['br', '{sections/results}']], [['cmd', '\\bibliography'], ['br', '{refs}']], [['cmd', '\\end'], ['br', '{document}']]],
    'macros.tex': [[['cm', '% macros.tex — shared definitions']], [['cmd', '\\newcommand'], ['br', '{\\block}'], ['br', '{\\mathcal{B}}']], [['cmd', '\\newcommand'], ['br', '{\\file}'], ['br', '{\\textsf{file}}']]],
    'refs.bib': [[['cmd', '@inproceedings'], ['br', '{fernandes2026blocks,']], [['txt', '  title = {Block-Addressable Editing},']], [['txt', '  author = {Fernandes, M. and Reis, A.},']], [['txt', '  year = {2026}}']]]
  };
  const stub = file => [[['cm', '% ' + file]], [], [['cm', '% new file — start typing…']]];
  function Tab({
    label,
    active,
    dirty,
    onClick,
    onClose
  }) {
    const [h, setH] = React.useState(false);
    return /*#__PURE__*/React.createElement("div", {
      onClick: onClick,
      onMouseEnter: () => setH(true),
      onMouseLeave: () => setH(false),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 7px 0 12px',
        borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
        background: active ? 'var(--paper-2)' : 'transparent',
        border: active ? '1px solid var(--border-default)' : '1px solid transparent',
        borderBottomColor: active ? 'var(--paper-2)' : 'transparent',
        marginBottom: -1,
        cursor: 'pointer',
        font: `var(--weight-${active ? 'semibold' : 'medium'}) var(--text-xs)/1 var(--font-mono)`,
        color: active ? 'var(--ink-800)' : 'var(--ink-400)'
      }
    }, label, dirty && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--clay-500)'
      }
    }), onClose && /*#__PURE__*/React.createElement("span", {
      onClick: e => {
        e.stopPropagation();
        onClose();
      },
      title: "Close tab",
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 15,
        height: 15,
        borderRadius: 3,
        color: 'var(--ink-400)',
        background: h ? 'var(--hover-fill)' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement(I.X, {
      size: 11
    })));
  }

  // highlight: wash the proposal-touched lines (4–7) while a diff is pending
  function SourceEditor({
    openFiles = [],
    active,
    highlight,
    onSelect,
    onCloseTab,
    onClose
  }) {
    const file = active || openFiles[0] || 'main.tex';
    const lines = SOURCES[file] || stub(file);
    const isIntro = /intro\.tex$/.test(file);
    const name = file.split('/').pop();
    const touched = n => highlight && isIntro && n >= 4 && n <= 7;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        flex: '1 1 0',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-app)',
        borderRight: '1px solid var(--border-default)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
        height: 'var(--rail-toolbar)',
        flex: '0 0 auto',
        padding: '0 10px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--surface-app)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-sans)',
        color: 'var(--ink-500)',
        letterSpacing: 'var(--tracking-caps)',
        textTransform: 'uppercase',
        alignSelf: 'center',
        marginRight: 8,
        flex: '0 0 auto'
      }
    }, "Source"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
        flex: 1,
        minWidth: 0,
        overflowX: 'auto'
      }
    }, (openFiles.length ? openFiles : [file]).map(f => /*#__PURE__*/React.createElement(Tab, {
      key: f,
      label: f.split('/').pop(),
      active: f === file,
      dirty: highlight && /intro\.tex$/.test(f),
      onClick: () => onSelect && onSelect(f),
      onClose: onCloseTab ? () => onCloseTab(f) : undefined
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        alignSelf: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: '0 0 auto'
      }
    }, highlight && isIntro && /*#__PURE__*/React.createElement(Badge, {
      tone: "accent",
      size: "sm"
    }, "pending edit"), /*#__PURE__*/React.createElement(IconButton, {
      size: "sm",
      label: "Close source pane",
      onClick: onClose
    }, /*#__PURE__*/React.createElement(I.X, {
      size: 15
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflow: 'auto',
        background: 'var(--paper-2)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      contentEditable: true,
      suppressContentEditableWarning: true,
      spellCheck: false,
      style: {
        outline: 'none',
        caretColor: 'var(--clay-500)',
        padding: '12px 0',
        minHeight: '100%'
      }
    }, lines.map((toks, i) => {
      const n = i + 1;
      return /*#__PURE__*/React.createElement("div", {
        key: n,
        style: {
          display: 'flex',
          alignItems: 'baseline',
          font: 'var(--text-sm)/1.75 var(--font-mono)',
          background: touched(n) ? 'var(--clay-50)' : 'transparent',
          boxShadow: touched(n) ? 'inset 2px 0 0 var(--clay-400)' : 'none'
        }
      }, /*#__PURE__*/React.createElement("span", {
        contentEditable: false,
        style: {
          width: 46,
          flex: '0 0 auto',
          textAlign: 'right',
          paddingRight: 14,
          color: touched(n) ? 'var(--clay-400)' : 'var(--ink-300)',
          fontSize: 'var(--text-xs)',
          userSelect: 'none'
        }
      }, n), /*#__PURE__*/React.createElement("span", {
        style: {
          whiteSpace: 'pre-wrap',
          paddingRight: 16
        }
      }, toks.length === 0 ? '\u00A0' : toks.map(([k, v], j) => /*#__PURE__*/React.createElement("span", {
        key: j,
        style: {
          color: COLOR[k],
          fontStyle: k === 'cm' ? 'italic' : 'normal'
        }
      }, v))));
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 26,
        flex: '0 0 auto',
        padding: '0 12px',
        borderTop: '1px solid var(--border-faint)',
        background: 'var(--surface-app)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-mono)',
        color: 'var(--ink-400)'
      }
    }, "LaTeX \xB7 UTF-8"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-2xs)/1 var(--font-mono)',
        color: 'var(--ink-400)'
      }
    }, name, " \xB7 ", lines.length, " lines")));
  }
  window.SourceEditor = SourceEditor;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/stanza/SourceEditor.jsx", error: String((e && e.message) || e) }); }

// ui_kits/stanza/TitleBar.jsx
try { (() => {
/* Stanza UI kit — TitleBar (window chrome) */
(function () {
  const {
    IconButton,
    CompilePill,
    Tooltip
  } = window.StanzaDesignSystem_d6c63d;
  const I = window.Icons;
  function TitleBar({
    title,
    compile,
    onCompile,
    onToggleSource,
    sourceOpen,
    onToggleChat,
    chatOpen,
    onCloseDoc
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 'var(--rail-titlebar)',
        flex: '0 0 auto',
        padding: '0 12px',
        background: 'var(--surface-app)',
        borderBottom: '1px solid var(--border-default)',
        WebkitAppRegion: 'drag'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flex: '0 0 auto'
      }
    }, ['#E05D52', '#E5A93D', '#5BB85C'].map(c => /*#__PURE__*/React.createElement("span", {
      key: c,
      onClick: onCloseDoc,
      style: {
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: c,
        cursor: 'pointer',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)'
      }
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "16",
      height: "16",
      viewBox: "0 0 32 32",
      fill: "none",
      style: {
        flex: '0 0 auto'
      }
    }, /*#__PURE__*/React.createElement("rect", {
      x: "4",
      y: "4",
      width: "24",
      height: "24",
      rx: "5.5",
      stroke: "var(--ink-700)",
      strokeWidth: "2.4"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "9.5",
      y1: "11.5",
      x2: "22.5",
      y2: "11.5",
      stroke: "var(--ink-700)",
      strokeWidth: "2.4",
      strokeLinecap: "round"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "9.5",
      y1: "16",
      x2: "19",
      y2: "16",
      stroke: "var(--clay-500)",
      strokeWidth: "2.4",
      strokeLinecap: "round"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "9.5",
      y1: "20.5",
      x2: "23",
      y2: "20.5",
      stroke: "var(--ink-700)",
      strokeWidth: "2.4",
      strokeLinecap: "round"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--weight-semibold) var(--text-sm)/1 var(--font-sans)',
        color: 'var(--ink-800)'
      }
    }, title), /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--text-xs)/1 var(--font-mono)',
        color: 'var(--ink-400)'
      }
    }, "\u2014 main.tex")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: '0 0 auto',
        WebkitAppRegion: 'no-drag'
      }
    }, /*#__PURE__*/React.createElement(CompilePill, {
      state: compile.state,
      errors: compile.errors,
      warnings: compile.warnings,
      onClick: onCompile
    }), /*#__PURE__*/React.createElement(Tooltip, {
      label: "Recompile",
      hint: "\u2318R",
      side: "bottom"
    }, /*#__PURE__*/React.createElement(IconButton, {
      label: "Recompile",
      onClick: onCompile
    }, /*#__PURE__*/React.createElement(I.Refresh, {
      size: 17
    }))), /*#__PURE__*/React.createElement(Tooltip, {
      label: "Source editor",
      hint: "\u2318E",
      side: "bottom"
    }, /*#__PURE__*/React.createElement(IconButton, {
      label: "Source editor",
      active: sourceOpen,
      onClick: onToggleSource
    }, /*#__PURE__*/React.createElement(I.Code, {
      size: 17
    }))), /*#__PURE__*/React.createElement(Tooltip, {
      label: "Assistant panel",
      hint: "\u2318J",
      side: "bottom"
    }, /*#__PURE__*/React.createElement(IconButton, {
      label: "Assistant panel",
      active: chatOpen,
      onClick: onToggleChat
    }, /*#__PURE__*/React.createElement(I.Sparkles, {
      size: 17
    }))), /*#__PURE__*/React.createElement(IconButton, {
      label: "Settings"
    }, /*#__PURE__*/React.createElement(I.Settings, {
      size: 17
    }))));
  }
  window.TitleBar = TitleBar;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/stanza/TitleBar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/stanza/Workspace.jsx
try { (() => {
/* Stanza UI kit — Workspace: panes + the multi-task, block-anchored edit loop.
   Each block edit is a TASK with its own margin card (left of the page).
   Several tasks can run concurrently — compose / busy / review each shown
   on its own card, aligned to its block. Chat panel stays optional. */
(function () {
  const {
    TitleBar,
    Sidebar,
    ChatPane,
    SourceEditor
  } = window;
  const I = window.Icons;
  function Workspace({
    onCloseDoc,
    preset = {},
    paper: paperProp,
    Pane
  }) {
    const paper = paperProp || window.STZ_PAPER;
    const PdfPaneC = Pane || window.PdfPane;
    const proposalFor = block => {
      const p = paper.proposals[block.id] || paper.proposals.default;
      return {
        ...p,
        files: p.files.length ? [block.file] : p.files,
        note: p.note
      };
    };
    const idRef = React.useRef(100);
    const [tasks, setTasks] = React.useState(preset.tasks || [{
      id: 1,
      blockIds: ['s1-p1'],
      instruction: 'Tighten this and add a forward reference to the method.',
      phase: 'compose',
      proposal: null
    }]);
    const [view, setView] = React.useState(preset.view || 'select');
    const [sourceOpen, setSourceOpen] = React.useState(preset.sourceOpen ?? false);
    const [chatOpen, setChatOpen] = React.useState(preset.chatOpen ?? false);
    const [instruction, setInstruction] = React.useState(''); // chat composer only
    const [compile, setCompile] = React.useState({
      state: 'ok',
      errors: 0,
      warnings: 0
    });
    const [messages, setMessages] = React.useState(preset.messages || [{
      role: 'claude',
      text: 'Document primed — 11 blocks across 4 files. Click a block in the page to start an edit; several can run at once.'
    }]);
    const [activeTask, setActiveTask] = React.useState(preset.activeTask ?? (preset.tasks ? preset.tasks[0].id : 1));
    const [files, setFiles] = React.useState(() => JSON.parse(JSON.stringify(paper.files)));
    const [openFiles, setOpenFiles] = React.useState([paper.mainFile || 'main.tex']);
    const [activeFile, setActiveFile] = React.useState(paper.mainFile || 'main.tex');
    const [sidebarOpen, setSidebarOpen] = React.useState(true);
    const [sourceW, setSourceW] = React.useState(520);
    const splitRef = React.useRef(null);
    const startDrag = e => {
      e.preventDefault();
      const move = ev => {
        const r = splitRef.current && splitRef.current.getBoundingClientRect();
        if (r) setSourceW(Math.max(300, Math.min(r.width - 360, ev.clientX - r.left)));
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        document.body.style.cursor = '';
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      document.body.style.cursor = 'col-resize';
    };
    const newRef = React.useRef(0);
    const openFile = path => {
      setOpenFiles(o => o.includes(path) ? o : [...o, path]);
      setActiveFile(path);
      setSourceOpen(true);
    };
    const closeTab = path => setOpenFiles(o => {
      const n = o.filter(x => x !== path);
      setActiveFile(a => a === path ? n[n.length - 1] || null : a);
      if (!n.length) setSourceOpen(false);
      return n;
    });
    const newFile = dir => {
      const base = `untitled-${++newRef.current}.tex`;
      if (dir && dir.dir) {
        const p = dir.dir + '/' + base;
        setFiles(fs => mapNode(fs, dir, n => [{
          ...n,
          open: true,
          children: [...n.children, {
            path: p
          }]
        }]));
        openFile(p);
        return;
      }
      setFiles(fs => [...fs, {
        path: base
      }]);
      openFile(base);
    };
    const newFolder = dir => {
      const name = `new-folder-${++newRef.current}`;
      if (dir && dir.dir) {
        setFiles(fs => mapNode(fs, dir, n => [{
          ...n,
          open: true,
          children: [...n.children, {
            dir: dir.dir + '/' + name,
            open: true,
            children: []
          }]
        }]));
        return;
      }
      setFiles(fs => [...fs, {
        dir: name,
        open: true,
        children: []
      }]);
    };

    // ── file-tree edits (right-click menu) ──────────────────────────────
    const renameInPath = (full, name) => {
      const i = full.lastIndexOf('/');
      return i >= 0 ? full.slice(0, i + 1) + name : name;
    };
    const dupPath = full => {
      const slash = full.lastIndexOf('/');
      const dir = slash >= 0 ? full.slice(0, slash + 1) : '';
      const base = slash >= 0 ? full.slice(slash + 1) : full;
      const dot = base.lastIndexOf('.');
      return dot > 0 ? `${dir}${base.slice(0, dot)} copy${base.slice(dot)}` : `${dir}${base} copy`;
    };
    // recursively rebuild the tree, applying `op` to the matched node
    const mapNode = (nodes, target, op) => nodes.flatMap(n => {
      if (n === target) return op(n);
      if (n.children) return [{
        ...n,
        children: mapNode(n.children, target, op)
      }];
      return [n];
    });
    const renameNode = (node, name) => {
      if (node.dir) {
        const slash = node.dir.lastIndexOf('/');
        const newDir = (slash >= 0 ? node.dir.slice(0, slash + 1) : '') + name;
        const oldPrefix = node.dir + '/';
        const fixPath = p => p.startsWith(oldPrefix) ? newDir + '/' + p.slice(oldPrefix.length) : p;
        const rewrite = nodes => nodes.map(c => c.dir ? {
          ...c,
          dir: fixPath(c.dir + '/').slice(0, -1),
          children: rewrite(c.children)
        } : {
          ...c,
          path: fixPath(c.path)
        });
        setFiles(fs => mapNode(fs, node, n => [{
          ...n,
          dir: newDir,
          children: rewrite(n.children)
        }]));
        setOpenFiles(o => o.map(fixPath));
        setActiveFile(a => a ? fixPath(a) : a);
        return;
      }
      const next = renameInPath(node.path, name);
      setFiles(fs => mapNode(fs, node, n => [{
        ...n,
        path: next
      }]));
      setOpenFiles(o => o.map(p => p === node.path ? next : p));
      setActiveFile(a => a === node.path ? next : a);
    };
    const duplicateNode = node => {
      if (node.dir) return;
      const next = dupPath(node.path);
      setFiles(fs => mapNode(fs, node, n => [n, {
        ...n,
        path: next,
        active: false
      }]));
    };
    const deleteNode = node => {
      setFiles(fs => mapNode(fs, node, () => []));
      const gather = n => n.dir ? n.children.flatMap(gather) : [n.path];
      gather(node).forEach(p => closeTab(p));
    };
    const selected = tasks.flatMap(t => t.blockIds);
    const busy = tasks.some(t => t.phase === 'busy');
    const blocksOf = t => t.blockIds.map(id => paper.blocks.find(b => b.id === id)).filter(Boolean);
    const updateTask = (id, patch) => setTasks(ts => ts.map(t => t.id === id ? {
      ...t,
      ...patch
    } : t));
    const removeTask = id => setTasks(ts => {
      const next = ts.filter(t => t.id !== id);
      setActiveTask(a => a === id ? next.length ? next[next.length - 1].id : null : a);
      return next;
    });
    const [adding, setAdding] = React.useState(false); // "+ blocks" mode: plain clicks append to the active draft

    // Clicking a section heading claims the WHOLE section.
    const expandIds = blockId => {
      const b = paper.blocks.find(x => x.id === blockId);
      if (b && b.kind === 'section' && b.sec) return paper.blocks.filter(x => x.sec === b.sec).map(x => x.id);
      return [blockId];
    };
    const toggleBlock = (blockId, additive = false) => {
      const ids = expandIds(blockId);
      const owner = tasks.find(t => t.blockIds.some(x => ids.includes(x)));
      const active = tasks.find(t => t.id === activeTask);

      // Additive (⇧/⌘-click or "+ blocks" mode): grow/shrink the active draft.
      if (additive && active && active.phase === 'compose') {
        if (owner && owner.id !== active.id) {
          setActiveTask(owner.id);
          return;
        } // claimed by another task
        const inTask = ids.every(id => active.blockIds.includes(id));
        const next = inTask ? active.blockIds.filter(x => !ids.includes(x)) : [...active.blockIds, ...ids.filter(id => !active.blockIds.includes(id))];
        next.length ? updateTask(active.id, {
          blockIds: next
        }) : removeTask(active.id);
        return;
      }
      if (owner) {
        // Locked while the agent works (busy) or a verdict is pending (review):
        // clicking only focuses the owning task's card.
        if (owner.phase === 'compose' && owner.id === activeTask && ids.every(id => owner.blockIds.includes(id))) {
          const rest = owner.blockIds.filter(x => !ids.includes(x));
          rest.length ? updateTask(owner.id, {
            blockIds: rest
          }) : removeTask(owner.id);
        } else {
          setActiveTask(owner.id);
        }
        return;
      }
      const nid = ++idRef.current;
      setTasks(ts => [...ts, {
        id: nid,
        blockIds: ids,
        instruction: '',
        phase: 'compose',
        proposal: null
      }]);
      setActiveTask(nid);
      setAdding(false);
    };
    const removeBlockFromTask = (taskId, blockId) => {
      const t = tasks.find(x => x.id === taskId);
      if (!t || t.phase !== 'compose') return;
      const rest = t.blockIds.filter(x => x !== blockId);
      rest.length ? updateTask(taskId, {
        blockIds: rest
      }) : removeTask(taskId);
    };
    const submitTask = id => {
      const t = tasks.find(x => x.id === id);
      if (!t || !t.instruction.trim() || t.phase !== 'compose') return;
      const blocks = blocksOf(t).map(b => ({
        id: b.id,
        file: b.file,
        span: b.span
      }));
      setMessages(m => [...m, {
        role: 'user',
        text: t.instruction.trim(),
        blocks
      }]);
      updateTask(id, {
        phase: 'busy'
      });
      setAdding(false);
      const target = blocksOf(t)[0];
      setTimeout(() => {
        const proposal = proposalFor(target);
        updateTask(id, {
          phase: 'review',
          proposal
        });
        setActiveTask(id); // surface the finished proposal
        setMessages(m => [...m, {
          role: 'claude',
          text: proposal.note,
          proposal,
          resolved: null,
          taskId: id
        }]);
      }, 1400 + Math.random() * 1200);
    };
    const resolveTask = (id, verdict) => {
      setMessages(m => m.map(msg => msg.taskId === id && msg.proposal && !msg.resolved ? {
        ...msg,
        resolved: verdict
      } : msg));
      if (verdict === 'accept') {
        setCompile({
          state: 'running',
          errors: 0,
          warnings: 0
        });
        setTimeout(() => setCompile({
          state: 'ok',
          errors: 0,
          warnings: 0
        }), 1300);
      }
      removeTask(id);
    };

    // Chat-side handlers (optional panel): act on the newest relevant task.
    const chatSubmit = () => {
      if (!instruction.trim()) return;
      const compose = tasks.filter(t => t.phase === 'compose').slice(-1)[0];
      if (!compose) return;
      updateTask(compose.id, {
        instruction: instruction.trim()
      });
      setInstruction('');
      setTimeout(() => submitTask(compose.id), 0);
    };
    const latestReview = tasks.filter(t => t.phase === 'review').slice(-1)[0];
    const recompile = () => {
      setCompile({
        state: 'running',
        errors: 0,
        warnings: 0
      });
      setTimeout(() => setCompile({
        state: 'ok',
        errors: 0,
        warnings: 0
      }), 1100);
    };
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--surface-app)'
      }
    }, /*#__PURE__*/React.createElement(TitleBar, {
      title: paper.project,
      compile: compile,
      onCompile: recompile,
      onToggleSource: () => setSourceOpen(o => !o),
      sourceOpen: sourceOpen,
      onToggleChat: () => setChatOpen(o => !o),
      chatOpen: chatOpen,
      onCloseDoc: onCloseDoc
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        display: 'flex',
        minHeight: 0
      }
    }, sidebarOpen ? /*#__PURE__*/React.createElement(Sidebar, {
      paper: paper,
      files: files,
      activeFile: activeFile,
      onOpenFile: openFile,
      onNewFile: newFile,
      onNewFolder: newFolder,
      onRenameNode: renameNode,
      onDuplicateNode: duplicateNode,
      onDeleteNode: deleteNode,
      onCollapse: () => setSidebarOpen(false),
      activeBlock: selected[0],
      onPickBlock: id => {
        setView('select');
        toggleBlock(id);
      }
    }) : /*#__PURE__*/React.createElement("div", {
      style: {
        width: 36,
        flex: '0 0 auto',
        borderRight: '1px solid var(--border-default)',
        background: 'var(--surface-app)',
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 10
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setSidebarOpen(true),
      title: "Show files",
      "aria-label": "Show files",
      style: {
        width: 26,
        height: 26,
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        background: 'transparent',
        color: 'var(--ink-500)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(I.ChevronRight, {
      size: 16
    }))), /*#__PURE__*/React.createElement("div", {
      ref: splitRef,
      style: {
        flex: 1,
        display: 'flex',
        minWidth: 0
      }
    }, sourceOpen && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        width: sourceW,
        flex: '0 0 auto',
        display: 'flex',
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement(SourceEditor, {
      openFiles: openFiles,
      active: activeFile,
      onSelect: setActiveFile,
      onCloseTab: closeTab,
      highlight: tasks.some(t => t.phase === 'review'),
      onClose: () => setSourceOpen(false)
    })), /*#__PURE__*/React.createElement("div", {
      onMouseDown: startDrag,
      title: "Drag to resize",
      style: {
        width: 7,
        flex: '0 0 auto',
        cursor: 'col-resize',
        background: 'var(--border-default)',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 2,
        height: 28,
        borderRadius: 2,
        background: 'var(--line-ink)'
      }
    }))), /*#__PURE__*/React.createElement(PdfPaneC, {
      paper: paper,
      tasks: tasks,
      blocksOf: blocksOf,
      activeTask: activeTask,
      onActivateTask: setActiveTask,
      adding: adding,
      onToggleAdding: () => setAdding(a => !a),
      onRemoveBlockFromTask: removeBlockFromTask,
      selected: selected,
      onToggleBlock: (id, e) => toggleBlock(id, adding || !!(e && (e.shiftKey || e.metaKey || e.ctrlKey))),
      view: view,
      onView: setView,
      onUpdateTask: updateTask,
      onSubmitTask: submitTask,
      onDismissTask: id => {
        removeTask(id);
        setAdding(false);
      },
      onResolveTask: resolveTask
    })), chatOpen && /*#__PURE__*/React.createElement(ChatPane, {
      messages: messages,
      busy: busy,
      selectedBlocks: tasks.filter(t => t.phase === 'compose').flatMap(blocksOf),
      instruction: instruction,
      setInstruction: setInstruction,
      onRemoveBlock: toggleBlock,
      onSubmit: chatSubmit,
      onAccept: () => latestReview && resolveTask(latestReview.id, 'accept'),
      onReject: () => latestReview && resolveTask(latestReview.id, 'reject')
    })));
  }
  window.Workspace = Workspace;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/stanza/Workspace.jsx", error: String((e && e.message) || e) }); }

// ui_kits/stanza/app.jsx
try { (() => {
/* Stanza UI kit — root app: OpenScreen → Workspace */
(function () {
  const {
    OpenScreen,
    Workspace
  } = window;
  function App({
    initial
  }) {
    const [screen, setScreen] = React.useState(initial || 'workspace'); // workspace default for the demo
    return /*#__PURE__*/React.createElement("div", {
      style: {
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }
    }, screen === 'open' ? /*#__PURE__*/React.createElement(OpenScreen, {
      onOpen: () => setScreen('workspace')
    }) : /*#__PURE__*/React.createElement(Workspace, {
      onCloseDoc: () => setScreen('open')
    }));
  }
  window.StanzaApp = App;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/stanza/app.jsx", error: String((e && e.message) || e) }); }

// ui_kits/stanza/icons.jsx
try { (() => {
/* Stanza UI kit — icon set.
   Lucide (ISC) path data, wrapped as tiny React components so the kit has
   consistent 2px-stroke iconography with no runtime dependency.
   https://lucide.dev */
(function () {
  const S = (paths, extra) => props => {
    const {
      size = 18,
      stroke = 2,
      style = {},
      ...rest
    } = props || {};
    return React.createElement('svg', {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: stroke,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      style,
      ...rest
    }, ...paths.map((d, i) => d.c ? React.createElement('circle', {
      key: i,
      cx: d.c[0],
      cy: d.c[1],
      r: d.c[2]
    }) : React.createElement('path', {
      key: i,
      d
    })), ...(extra || []));
  };
  window.Icons = {
    FileText: S(['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M10 9H8', 'M16 13H8', 'M16 17H8']),
    Folder: S(['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z']),
    Search: S(['m21 21-4.34-4.34', {
      c: [11, 11, 8]
    }]),
    Refresh: S(['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5']),
    Code: S(['m18 16 4-4-4-4', 'm6 8-4 4 4 4', 'm14.5 4-5 16']),
    PanelRight: S(['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M15 3v18']),
    Columns: S(['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M12 3v18']),
    Check: S(['M20 6 9 17l-5-5']),
    X: S(['M18 6 6 18', 'm6 6 12 12']),
    Enter: S(['M9 10 4 15l5 5', 'M20 4v7a4 4 0 0 1-4 4H4']),
    Sparkles: S(['M9.94 14.66A1 1 0 0 1 9 14a1 1 0 0 1 .94-.66 5 5 0 0 0 3.4-3.4 1 1 0 0 1 1.32 0 5 5 0 0 0 3.4 3.4 1 1 0 0 1 0 1.32 5 5 0 0 0-3.4 3.4 1 1 0 0 1-1.32 0 5 5 0 0 0-3.4-3.4Z', 'M5 3v4', 'M3 5h4', 'M19 17v2', 'M18 18h2']),
    Commit: S(['M12 3v6', 'M12 15v6', {
      c: [12, 12, 3]
    }]),
    Undo: S(['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11']),
    ChevronRight: S(['m9 18 6-6-6-6']),
    ChevronDown: S(['m6 9 6 6 6-6']),
    Settings: S(['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', {
      c: [12, 12, 3]
    }]),
    Plus: S(['M5 12h14', 'M12 5v14']),
    ZoomIn: S(['m21 21-4.34-4.34', 'M11 8v6', 'M8 11h6', {
      c: [11, 11, 8]
    }]),
    ZoomOut: S(['m21 21-4.34-4.34', 'M8 11h6', {
      c: [11, 11, 8]
    }]),
    History: S(['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2']),
    PenLine: S(['M12 20h9', 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z']),
    List: S(['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01']),
    Image: S(['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21', {
      c: [9, 9, 2]
    }]),
    Lock: S(['M5 11a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z', 'M7 9V7a5 5 0 0 1 10 0v2']),
    Maximize: S(['M15 3h6v6', 'm21 3-7 7', 'm3 21 7-7', 'M9 21H3v-6']),
    ArrowUp: S(['m5 12 7-7 7 7', 'M12 19V5']),
    Sigma: S(['M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a.5.5 0 0 1 0 .6l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2']),
    Copy: S(['M9 9a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1']),
    Trash: S(['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6']),
    Link: S(['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71']),
    CornerUpRight: S(['m15 14 5-5-5-5', 'M4 20v-7a4 4 0 0 1 4-4h12'])
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/stanza/icons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/stanza/paperData.js
try { (() => {
/* Stanza UI kit — sample document model.
   A believable single-column LaTeX paper, parsed into addressable blocks.
   Each block carries a source span (file:line) — the unit Claude ops scope to.
   Self-referential subject matter keeps the sample safe and on-theme. */
(function () {
  window.STZ_PAPER = {
    project: 'block-editing',
    mainFile: 'main.tex',
    files: [{
      path: 'main.tex',
      active: true
    }, {
      path: 'macros.tex'
    }, {
      path: 'refs.bib'
    }, {
      dir: 'sections',
      open: true,
      children: [{
        path: 'sections/intro.tex'
      }, {
        path: 'sections/method.tex'
      }, {
        path: 'sections/results.tex'
      }]
    }, {
      dir: 'figures',
      open: true,
      children: [{
        path: 'figures/pipeline.pdf'
      }, {
        path: 'figures/block-map.png'
      }, {
        path: 'figures/latency.png'
      }]
    }, {
      dir: 'tables',
      children: [{
        path: 'tables/ablation.tex'
      }]
    }, {
      dir: 'notes',
      children: [{
        path: 'notes/outline.md'
      }, {
        path: 'notes/reviewer-response.txt'
      }]
    }],
    // Rendered blocks, in page order.
    blocks: [{
      id: 'title',
      kind: 'title',
      file: 'main.tex',
      span: '12–14',
      text: 'Block-Addressable Editing of Structured Documents'
    }, {
      id: 'authors',
      kind: 'paragraph',
      file: 'main.tex',
      span: '16–18',
      text: 'M. Fernandes,  A. Reis,  J. Costa'
    }, {
      id: 'affil',
      kind: 'paragraph',
      file: 'main.tex',
      span: '19',
      text: 'Instituto Superior Técnico'
    }, {
      id: 'abs-h',
      kind: 'section',
      file: 'main.tex',
      span: '24',
      text: 'Abstract',
      heading: true,
      sec: 'abs'
    }, {
      id: 'abstract',
      kind: 'paragraph',
      file: 'main.tex',
      span: '25–31',
      sec: 'abs',
      text: 'We present a method for editing structured documents by addressing their rendered output rather than their source. A document is parsed into a tree of blocks, each retaining its source span. Selecting a region of the rendering resolves to a block; a natural-language instruction is then scoped to that block\u2019s span. We show the approach reduces edit latency and preserves cross-references across revisions.'
    }, {
      id: 's1-h',
      kind: 'section',
      file: 'sections/intro.tex',
      span: '1',
      text: '1   Introduction',
      sec: 's1'
    }, {
      id: 's1-p1',
      kind: 'paragraph',
      file: 'sections/intro.tex',
      span: '3–9',
      sec: 's1',
      text: 'Authors of technical documents think in terms of what they see \u2014 a paragraph, an equation, a figure \u2014 not in terms of line numbers in a source file. Yet every editing tool asks them to translate between the two. The model is good and works well in many cases, but the translation step is a persistent source of friction.'
    }, {
      id: 's1-eq',
      kind: 'equation',
      file: 'sections/intro.tex',
      span: '11–13',
      sec: 's1',
      text: '\\mathcal{B}(p, x, y)\\;\\longmapsto\\;(\\textsf{file},\\,\\ell)\\;\\longmapsto\\;\\textsf{block}',
      num: '1'
    }, {
      id: 's1-p2',
      kind: 'paragraph',
      file: 'sections/intro.tex',
      span: '15–20',
      sec: 's1',
      text: 'We close this gap with a bidirectional map between rendered coordinates and source spans (1). A selection in the page becomes a file-and-line pair, which resolves to the enclosing block of the parsed tree. Edits are proposed as diffs and reviewed in place.'
    }, {
      id: 's2-h',
      kind: 'section',
      file: 'sections/method.tex',
      span: '1',
      text: '2   Method',
      sec: 's2'
    }, {
      id: 's2-p1',
      kind: 'paragraph',
      file: 'sections/method.tex',
      span: '3–10',
      sec: 's2',
      text: 'The document folder is treated as a version-controlled workspace. Before each operation the working tree is required to be clean; the resulting diff is the proposal. Accepting commits the change; rejecting restores the prior state. This yields a complete, reversible history of every machine-authored edit.'
    }],
    // Canned Claude proposals, keyed by target block (demo).
    proposals: {
      's1-p1': {
        note: 'Tightened the opening paragraph and added a forward reference to the method (§2). Removed the filler clause; kept the cross-reference intact.',
        targetBlock: 's1-p1',
        files: ['sections/intro.tex'],
        // rendered (compiled) comparison segments: k = unchanged, d = removed, a = added
        before: [['k', 'Authors of technical documents think in terms of what they see — a paragraph, an equation, a figure — not '], ['d', 'in terms of '], ['k', 'line numbers in a source file. Yet '], ['d', 'every editing tool asks '], ['k', 'them to translate between the two'], ['d', '. The model is good and works well in many cases, but the translation step is a persistent source of friction.']],
        after: [['k', 'Authors of technical documents think in terms of what they see — a paragraph, an equation, a figure — not '], ['k', 'line numbers in a source file. Yet '], ['a', 'editors force '], ['k', 'them to translate between the two'], ['a', ', a persistent source of friction we remove in §2.']],
        diff: '@@ -3,7 +3,6 @@\n Authors of technical documents think in terms of what they\n-see — a paragraph, an equation, a figure — not in terms of line\n-numbers in a source file. Yet every editing tool asks them to\n-translate between the two. The model is good and works well in\n-many cases, but the translation step is a persistent source of\n-friction.\n+see — a paragraph, an equation, a figure — not line numbers in a\n+source file. Yet editors force them to translate between the two,\n+a persistent source of friction we remove in \\S2.'
      },
      'abstract': {
        note: 'Sharpened the abstract’s first sentence — the contribution now leads; method detail moved to the second sentence.',
        targetBlock: 'abstract',
        files: ['main.tex'],
        before: [['d', 'We present a method for editing structured documents by addressing their rendered output rather than their source.'], ['k', ' A document is parsed into a tree of blocks, each retaining its source span. Selecting a region of the rendering resolves to a block; a natural-language instruction is then scoped to that block’s span.']],
        after: [['a', 'We edit structured documents by addressing the rendered page directly.'], ['k', ' A document is parsed into a tree of blocks, each retaining its source span. Selecting a region of the rendering resolves to a block; a natural-language instruction is then scoped to that block’s span.']],
        diff: '@@ -25,5 +25,4 @@\n-We present a method for editing structured documents by\n-addressing their rendered output rather than their source. A\n-document is parsed into a tree of blocks, each retaining its\n-source span.\n+We edit structured documents by addressing the rendered page\n+directly. A document is parsed into a tree of blocks, each\n+retaining its source span.'
      },
      default: {
        note: 'Applied the requested edit; cross-references and labels preserved.',
        files: ['sections/intro.tex'],
        before: [['k', 'We close this gap with a bidirectional map between rendered coordinates and source spans (1)'], ['d', '. A selection in the page becomes a file-and-line pair, which resolves to the enclosing block.']],
        after: [['k', 'We close this gap with a bidirectional map between rendered coordinates and source spans (1)'], ['a', '; a selection resolves to the enclosing block of the parsed tree.']],
        diff: '@@ -15,4 +15,3 @@\n We close this gap with a bidirectional map between rendered\n-coordinates and source spans (1). A selection in the page becomes\n-a file-and-line pair, which resolves to the enclosing block.\n+coordinates and source spans (1); a selection resolves to the\n+enclosing block of the parsed tree.'
      }
    },
    // Back-compat: the single canned proposal some cards still reference.
    proposal: {
      note: 'Tightened the opening paragraph and added a forward reference to the method (\u00a72). Removed the filler clause; kept the cross-reference intact.',
      targetBlock: 's1-p1',
      files: ['sections/intro.tex'],
      diff: '@@ -3,7 +3,6 @@\n Authors of technical documents think in terms of what they\n-see \u2014 a paragraph, an equation, a figure \u2014 not in terms of line\n-numbers in a source file. Yet every editing tool asks them to\n-translate between the two. The model is good and works well in\n-many cases, but the translation step is a persistent source of\n-friction.\n+see \u2014 a paragraph, an equation, a figure \u2014 not line numbers in a\n+source file. Yet editors force them to translate between the two,\n+a persistent source of friction we remove in \\S2.'
    }
  };

  /* ---- A TWO-COLUMN paper (NeurIPS/IEEE-style). Blocks carry a column
     hint (full | l | r) so the edit loop can hang each Claude bubble in
     the margin nearest its column. ---- */
  window.STZ_PAPER2 = {
    project: 'sparse-routing',
    mainFile: 'main.tex',
    twoColumn: true,
    files: [{
      path: 'main.tex',
      active: true
    }, {
      path: 'macros.tex'
    }, {
      path: 'refs.bib'
    }, {
      dir: 'sections',
      open: true,
      children: [{
        path: 'sections/intro.tex'
      }, {
        path: 'sections/method.tex'
      }, {
        path: 'sections/experiments.tex'
      }]
    }, {
      dir: 'figures',
      children: [{
        path: 'figures/routing.pdf'
      }, {
        path: 'figures/scaling.png'
      }]
    }],
    blocks: [{
      id: 'title',
      kind: 'title',
      col: 'full',
      file: 'main.tex',
      span: '14–16',
      text: 'Sparse Routing for Long-Context Attention'
    }, {
      id: 'authors',
      kind: 'authors',
      col: 'full',
      file: 'main.tex',
      span: '18–21',
      text: 'A. Reis¹    M. Fernandes¹    J. Costa²'
    }, {
      id: 'affil',
      kind: 'affil',
      col: 'full',
      file: 'main.tex',
      span: '22',
      text: '¹Instituto Superior Técnico    ²INESC-ID'
    }, {
      id: 'abs-h',
      kind: 'abshead',
      col: 'full',
      file: 'main.tex',
      span: '26',
      text: 'Abstract',
      sec: 'abs'
    }, {
      id: 'abstract',
      kind: 'abstract',
      col: 'full',
      file: 'main.tex',
      span: '27–34',
      sec: 'abs',
      text: 'Attention over long contexts is dominated by the quadratic cost of all-pairs interaction. We introduce a learned router that sends each query to a sparse set of key blocks, reducing cost to near-linear while retaining the accuracy of dense attention. The router is trained end-to-end and adds no inference-time hyperparameters.'
    }, {
      id: 's1-h',
      kind: 'section',
      col: 'l',
      file: 'sections/intro.tex',
      span: '1',
      text: '1   Introduction',
      sec: 's1'
    }, {
      id: 'l-p1',
      kind: 'paragraph',
      col: 'l',
      file: 'sections/intro.tex',
      span: '3–11',
      sec: 's1',
      text: 'Transformer attention compares every query with every key, so the cost grows with the square of the sequence length. For documents, codebases, and long dialogues this quickly dominates both compute and memory, and a range of sparse and low-rank schemes have been proposed to contain it.'
    }, {
      id: 'l-p2',
      kind: 'paragraph',
      col: 'l',
      file: 'sections/intro.tex',
      span: '13–19',
      sec: 's1',
      text: 'Most such schemes fix the sparsity pattern in advance. We instead learn which key blocks each query should attend to, letting the model spend its budget where it matters and adapt the pattern per input.'
    }, {
      id: 's2-h',
      kind: 'section',
      col: 'l',
      file: 'sections/method.tex',
      span: '1',
      text: '2   Method',
      sec: 's2'
    }, {
      id: 'l-p3',
      kind: 'paragraph',
      col: 'l',
      file: 'sections/method.tex',
      span: '3–12',
      sec: 's2',
      text: 'Keys are partitioned into contiguous blocks. For each query a lightweight router scores every block and selects the top-k; attention is then computed only against the selected blocks. The score is a dot product against a learned block summary, so routing adds negligible overhead.'
    }, {
      id: 'r-eq',
      kind: 'equation',
      col: 'r',
      file: 'sections/method.tex',
      span: '14–16',
      text: 'router(q) = top-k( qᵀS )',
      num: '2'
    }, {
      id: 'r-p1',
      kind: 'paragraph',
      col: 'r',
      file: 'sections/method.tex',
      span: '18–25',
      sec: 's2',
      text: 'Here S holds one summary vector per key block. Because the top-k operation is not differentiable, we train the router with a straight-through estimator and a small load-balancing penalty that discourages collapse onto a few blocks.'
    }, {
      id: 's3-h',
      kind: 'section',
      col: 'r',
      file: 'sections/experiments.tex',
      span: '1',
      text: '3   Experiments',
      sec: 's3'
    }, {
      id: 'r-p2',
      kind: 'paragraph',
      col: 'r',
      file: 'sections/experiments.tex',
      span: '3–10',
      sec: 's3',
      text: 'On long-context language modeling the router matches dense attention within 0.2 perplexity while attending to a quarter of the keys. End-to-end throughput improves 2.3× at 32k tokens, and the gap widens with sequence length.'
    }, {
      id: 'r-fig',
      kind: 'figure',
      col: 'r',
      file: 'sections/experiments.tex',
      span: '12–15',
      text: 'Figure 1: Perplexity vs. attended-key fraction. The router (clay) tracks dense attention down to ~25% of keys.'
    }],
    proposals: {
      'l-p2': {
        note: 'Made the contrast with prior work explicit and named the contribution (learned, per-input routing) up front.',
        files: ['sections/intro.tex'],
        before: [['d', 'Most such schemes fix the sparsity pattern in advance.'], ['k', ' We instead learn which key blocks each query should attend to, letting the model spend its budget where it matters '], ['d', 'and adapt the pattern per input.']],
        after: [['a', 'Prior schemes fix the sparsity pattern in advance and cannot adapt to the input.'], ['k', ' We instead learn which key blocks each query should attend to, letting the model spend its budget where it matters '], ['a', '— a pattern chosen per query, end-to-end.']],
        diff: '@@ -13,7 +13,7 @@\n-Most such schemes fix the sparsity pattern in advance. We\n-instead learn which key blocks each query should attend to,\n-letting the model spend its budget where it matters and adapt\n-the pattern per input.\n+Prior schemes fix the sparsity pattern in advance and cannot\n+adapt to the input. We instead learn which key blocks each query\n+should attend to, letting the model spend its budget where it\n+matters; a pattern chosen per query, end-to-end.'
      },
      'r-p2': {
        note: 'Led with the headline result and tightened the throughput claim.',
        files: ['sections/experiments.tex'],
        before: [['k', 'On long-context language modeling the router matches dense attention within 0.2 perplexity while attending to a quarter of the keys. '], ['d', 'End-to-end throughput improves 2.3× at 32k tokens, and the gap widens with sequence length.']],
        after: [['k', 'On long-context language modeling the router matches dense attention within 0.2 perplexity while attending to a quarter of the keys. '], ['a', 'Throughput improves 2.3× at 32k tokens and 3.1× at 64k, so the advantage grows with context length.']],
        diff: '@@ -3,8 +3,8 @@\n On long-context language modeling the router matches dense\n attention within 0.2 perplexity while attending to a quarter of\n-the keys. End-to-end throughput improves 2.3x at 32k tokens, and\n-the gap widens with sequence length.\n+the keys. Throughput improves 2.3x at 32k tokens and 3.1x at\n+64k, so the advantage grows with context length.'
      },
      default: {
        note: 'Applied the requested edit; cross-references and equation labels preserved.',
        files: ['main.tex'],
        before: [['k', 'We introduce a learned router that sends each query to a sparse set of key blocks, '], ['d', 'reducing cost to near-linear while retaining the accuracy of dense attention.']],
        after: [['k', 'We introduce a learned router that sends each query to a sparse set of key blocks, '], ['a', 'cutting attention cost to near-linear at no measurable loss in accuracy.']],
        diff: '@@ -27,3 +27,3 @@\n a learned router that sends each query to a sparse set of key\n-blocks, reducing cost to near-linear while retaining the\n-accuracy of dense attention.\n+blocks, cutting attention cost to near-linear at no measurable\n+loss in accuracy.'
      }
    }
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/stanza/paperData.js", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Kbd = __ds_scope.Kbd;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.StatusDot = __ds_scope.StatusDot;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.BlockTag = __ds_scope.BlockTag;

__ds_ns.CompilePill = __ds_scope.CompilePill;

__ds_ns.DiffHunk = __ds_scope.DiffHunk;

__ds_ns.DiffLine = __ds_scope.DiffLine;

})();
