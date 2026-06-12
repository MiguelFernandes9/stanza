/* Stanza UI kit — root app: OpenScreen → Workspace */
(function () {
  const { OpenScreen, Workspace } = window;

  function App({ initial }) {
    const [screen, setScreen] = React.useState(initial || 'workspace'); // workspace default for the demo
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {screen === 'open'
          ? <OpenScreen onOpen={() => setScreen('workspace')} />
          : <Workspace onCloseDoc={() => setScreen('open')} />}
      </div>
    );
  }

  window.StanzaApp = App;
})();
