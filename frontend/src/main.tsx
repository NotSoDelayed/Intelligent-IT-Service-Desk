import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from './providers/AuthProvider';
import { QueryProvider } from './providers/QueryProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <QueryProvider>
          <ThemeProvider>
            <TooltipProvider delayDuration={300}>
              <App />
              <Toaster richColors closeButton position="bottom-right" />
            </TooltipProvider>
          </ThemeProvider>
        </QueryProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
