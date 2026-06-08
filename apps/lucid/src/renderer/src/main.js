import { jsx as _jsx } from "react/jsx-runtime";
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@uclaw/ui/lib/i18n';
import { TooltipProvider } from '@uclaw/ui/components/tooltip';
import App from './App';
import './index.css';
ReactDOM.createRoot(document.getElementById('root')).render(_jsx(React.StrictMode, { children: _jsx(HashRouter, { children: _jsx(TooltipProvider, { children: _jsx(App, {}) }) }) }));
