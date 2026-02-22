import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from '@/App';

describe('App checklist integration', () => {
  it('shows checklist tab toggle', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /CHECKLIST/i })).toBeInTheDocument();
  });
});
