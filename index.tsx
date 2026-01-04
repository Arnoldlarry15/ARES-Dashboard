
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { auth0Config, isAuth0Configured } from './config/auth0Config';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// If Auth0 is configured, wrap with Auth0Provider, otherwise use local auth
const AppWithAuth = isAuth0Configured() ? (
  <Auth0Provider {...auth0Config}>
    <App />
  </Auth0Provider>
) : (
  <App />
);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {AppWithAuth}
    </ErrorBoundary>
  </React.StrictMode>
);
