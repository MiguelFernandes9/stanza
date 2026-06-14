/* Stanza UI kit — icon set.
   Lucide (ISC) path data, wrapped as tiny React components so the kit has
   consistent 2px-stroke iconography with no runtime dependency.
   https://lucide.dev */
(function () {
  const S = (paths, extra) => (props) => {
    const { size = 18, stroke = 2, style = {}, ...rest } = props || {};
    return React.createElement(
      'svg',
      {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round',
        strokeLinejoin: 'round', style, ...rest
      },
      ...paths.map((d, i) =>
        d.c
          ? React.createElement('circle', { key: i, cx: d.c[0], cy: d.c[1], r: d.c[2] })
          : React.createElement('path', { key: i, d })
      ),
      ...(extra || [])
    );
  };

  window.Icons = {
    FileText: S(['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M10 9H8', 'M16 13H8', 'M16 17H8']),
    Folder: S(['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z']),
    Search: S(['m21 21-4.34-4.34', { c: [11, 11, 8] }]),
    Refresh: S(['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5']),
    Code: S(['m18 16 4-4-4-4', 'm6 8-4 4 4 4', 'm14.5 4-5 16']),
    PanelRight: S(['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M15 3v18']),
    Columns: S(['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M12 3v18']),
    Check: S(['M20 6 9 17l-5-5']),
    X: S(['M18 6 6 18', 'm6 6 12 12']),
    Enter: S(['M9 10 4 15l5 5', 'M20 4v7a4 4 0 0 1-4 4H4']),
    Sparkles: S(['M9.94 14.66A1 1 0 0 1 9 14a1 1 0 0 1 .94-.66 5 5 0 0 0 3.4-3.4 1 1 0 0 1 1.32 0 5 5 0 0 0 3.4 3.4 1 1 0 0 1 0 1.32 5 5 0 0 0-3.4 3.4 1 1 0 0 1-1.32 0 5 5 0 0 0-3.4-3.4Z', 'M5 3v4', 'M3 5h4', 'M19 17v2', 'M18 18h2']),
    Commit: S(['M12 3v6', 'M12 15v6', { c: [12, 12, 3] }]),
    Undo: S(['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11']),
    ChevronRight: S(['m9 18 6-6-6-6']),
    ChevronDown: S(['m6 9 6 6 6-6']),
    Settings: S(['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', { c: [12, 12, 3] }]),
    Plus: S(['M5 12h14', 'M12 5v14']),
    ZoomIn: S(['m21 21-4.34-4.34', 'M11 8v6', 'M8 11h6', { c: [11, 11, 8] }]),
    ZoomOut: S(['m21 21-4.34-4.34', 'M8 11h6', { c: [11, 11, 8] }]),
    History: S(['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2']),
    PenLine: S(['M12 20h9', 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z']),
    List: S(['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01']),
    Image: S(['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21', { c: [9, 9, 2] }]),
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
