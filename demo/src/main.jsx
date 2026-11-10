import { Component } from "react";
import { createRoot } from "react-dom/client";

class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("The meeting demo failed to render:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" style={errorStyle}>
          <strong>The meeting demo could not render.</strong>
          <pre>{this.state.error.message || String(this.state.error)}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

const errorStyle = {
  minHeight: "100vh",
  padding: 24,
  boxSizing: "border-box",
  background: "#0b0b0f",
  color: "#ff5c5c",
  fontFamily: "system-ui, sans-serif",
  whiteSpace: "pre-wrap",
};

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('The meeting demo requires an element with id="root".');
}

const root = createRoot(rootElement);
const showImportError = (error) => {
  console.error("The meeting demo failed to load:", error);
  root.render(
    <div role="alert" style={errorStyle}>
      <strong>The meeting demo could not load.</strong>
      <pre>{error.message || String(error)}</pre>
    </div>,
  );
};

import("./App.jsx")
  .then(({ default: App }) => {
    root.render(
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>,
    );
  })
  .catch(showImportError);