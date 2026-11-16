import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountBillingCard } from './AccountBillingCard';

jest.mock('../billing/EntitlementProvider', () => ({
  useEntitlement: jest.fn(),
}));

const mockUseEntitlement = jest.requireMock('../billing/EntitlementProvider').useEntitlement as jest.Mock;

const baseEntitlement = {
  annualPromoActive: false,
  annualDisplayPrice: '$30/year',
  billingEnabled: true,
  billingStatus: 'inactive',
  checkoutEnabled: true,
  effectiveSource: 'none',
  error: null,
  monthlyDisplayPrice: '$3/month',
  openBillingPortal: jest.fn(),
  planInterval: null,
  premiumActive: false,
  stripeCustomerId: null,
};

describe('AccountBillingCard checkout', () => {
  it('starts checkout for the chosen plan', async () => {
    const openCheckout = jest.fn().mockResolvedValue(undefined);
    mockUseEntitlement.mockReturnValue({ ...baseEntitlement, openCheckout });

    render(<AccountBillingCard />);
    fireEvent.click(screen.getByRole('button', { name: /upgrade annual/i }));

    await waitFor(() => expect(openCheckout).toHaveBeenCalledWith('annual'));
  });

  it('shows an error when checkout throws synchronously or rejects', async () => {
    const openCheckout = jest.fn(() => {
      throw new Error('Checkout is unavailable');
    });
    mockUseEntitlement.mockReturnValue({ ...baseEntitlement, openCheckout });

    render(<AccountBillingCard />);
    fireEvent.click(screen.getByRole('button', { name: /upgrade monthly/i }));

    expect(await screen.findByText('Checkout is unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upgrade monthly/i })).not.toBeDisabled();
  });

  it('explains why the upgrade buttons are disabled when checkout is off', () => {
    mockUseEntitlement.mockReturnValue({ ...baseEntitlement, checkoutEnabled: false, openCheckout: jest.fn() });

    render(<AccountBillingCard />);

    expect(screen.getByRole('button', { name: /upgrade annual/i })).toBeDisabled();
    expect(screen.getByText(/not available on this deployment yet/i)).toBeInTheDocument();
  });

  it('hides upgrade buttons for premium accounts and links to the marketing pricing page', () => {
    mockUseEntitlement.mockReturnValue({ ...baseEntitlement, premiumActive: true, openCheckout: jest.fn() });

    render(<AccountBillingCard />);

    expect(screen.queryByRole('button', { name: /upgrade/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view pricing/i })).toHaveAttribute('href', 'https://gfcweather.com/pricing/');
  });
});
