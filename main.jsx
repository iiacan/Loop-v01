import React from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './store.jsx';
import App from './App.jsx';

class Boundary extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="boot">
        <h1>Something went wrong on this screen</h1>
        <p>Your saved loops are untouched in browser storage. Reloading usually fixes it.</p>
        <pre>{String(this.state.err?.message || this.state.err)}</pre>
        <button className="btn primary" onClick={() => { location.hash = '/home'; location.reload(); }}>Reload Loop</button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <Boundary><StoreProvider><App /></StoreProvider></Boundary>
);

// Optional offline support: if sw.js sits next to index.html, cache the app shell.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
