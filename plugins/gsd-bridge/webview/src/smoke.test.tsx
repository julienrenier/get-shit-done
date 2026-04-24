import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from './app-shell';

describe('AppShell smoke test', () => {
  it('renders the brand header', () => {
    render(<AppShell />);
    expect(screen.getByText(/GSD Bridge Webview/i)).toBeTruthy();
  });

  it('renders the placeholder paragraph', () => {
    render(<AppShell />);
    expect(screen.getByText(/Catalog and renderer wired in Plan 04-03/i)).toBeTruthy();
  });
});
