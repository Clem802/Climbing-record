import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BoulderCard from '../BoulderCard.jsx';

describe('BoulderCard', () => {
  it('renders boulder number', () => {
    render(<BoulderCard number={7} value={null} onChange={() => {}} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('calls onChange with attempt value when button clicked', () => {
    const onChange = vi.fn();
    render(<BoulderCard number={1} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByText('1'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('deselects when same value clicked again', () => {
    const onChange = vi.fn();
    render(<BoulderCard number={1} value={2} onChange={onChange} />);
    fireEvent.click(screen.getByText('2'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows — as default unselected state', () => {
    render(<BoulderCard number={1} value={null} onChange={() => {}} />);
    const dashBtn = screen.getByText('—');
    expect(dashBtn).toBeInTheDocument();
  });
});
