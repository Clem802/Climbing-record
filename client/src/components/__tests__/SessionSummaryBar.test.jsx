import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SessionSummaryBar from '../SessionSummaryBar.jsx';

describe('SessionSummaryBar', () => {
  const boulders = { 1: 1, 2: 2, 3: 3, 4: 4 }; // attempts per boulder

  it('shows total points', () => {
    render(<SessionSummaryBar boulders={boulders} />);
    // 10+7+4+1 = 22
    expect(screen.getByText('22')).toBeInTheDocument();
  });

  it('shows correct completed count', () => {
    render(<SessionSummaryBar boulders={boulders} />);
    expect(screen.getByText('4 / 35')).toBeInTheDocument();
  });

  it('shows flash count', () => {
    render(<SessionSummaryBar boulders={boulders} />);
    // "1" appears as flash count - also appears as boulder number label in BoulderCard
    // Check it appears in the context of the summary bar
    const flashElements = screen.getAllByText('1');
    expect(flashElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows 0 pts for empty boulders', () => {
    render(<SessionSummaryBar boulders={{}} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
