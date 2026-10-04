// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { indexById } from '../../domain/collections';
import { allPendingOccurrences } from '../../domain/recurring';
import { makeAccount, makeCategory, makeRecurring } from '../../domain/testing/factories';
import { PendingCard } from './PendingCard';

const cash = makeAccount({ id: 'cash', name: 'Efectivo' });
const old = makeAccount({ id: 'old', name: 'Caja vieja', archivedAt: 1 });
const home = makeCategory({ id: 'home', name: 'Hogar', type: 'expense' });
const today = '2026-10-04';

function setup(
  recurring = [makeRecurring({ accountId: 'cash', categoryId: 'home', startDate: today })],
) {
  const handlers = { onConfirm: vi.fn(), onSkip: vi.fn(), onEdit: vi.fn() };
  const pending = allPendingOccurrences(recurring, today);
  render(
    <PendingCard
      pending={pending}
      accounts={indexById([cash, old])}
      categories={indexById([home])}
      today={today}
      {...handlers}
    />,
  );
  return { ...handlers, pending, user: userEvent.setup() };
}

// Lista cada ocurrencia pendiente por separado (SRS 5.10) y no se muestra si no hay ninguna.
describe('lista de pendientes', () => {
  it('muestra una fila por ocurrencia, con su fecha y monto', () => {
    const rent = makeRecurring({
      accountId: 'cash',
      categoryId: 'home',
      startDate: '2026-08-04',
      amount: 250_000_00,
    });
    setup([rent]);
    expect(screen.getByRole('heading')).toHaveTextContent('Pendientes de confirmar (3)');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('4 ago.');
    expect(rows[2]).toHaveTextContent('Hoy');
    expect(rows[2]).toHaveTextContent('− $ 250.000,00');
  });

  it('sin pendientes no se muestra', () => {
    const { container } = render(
      <PendingCard
        pending={[]}
        accounts={new Map()}
        categories={new Map()}
        today={today}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('confirmar y saltar', () => {
  it('Confirmar avisa qué ocurrencia se eligió', async () => {
    const { onConfirm, pending, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledWith(pending[0]);
  });

  // Saltar no carga el movimiento: pide confirmación antes.
  it('Saltar pide confirmación', async () => {
    const { onSkip, pending, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Saltar' }));
    const dialog = screen.getByRole('dialog', { name: '¿Saltar Alquiler?' });
    await user.click(within(dialog).getByRole('button', { name: 'Saltar' }));
    expect(onSkip).toHaveBeenCalledWith(pending[0]);
  });

  // ADR 0009: con la cuenta archivada no se puede confirmar; se ofrece editar o saltar.
  it('con la cuenta archivada ofrece "Editar recurrente" en vez de Confirmar', async () => {
    const { onEdit, user } = setup([
      makeRecurring({ accountId: 'old', categoryId: 'home', startDate: today }),
    ]);
    expect(screen.getByText('La cuenta Caja vieja está archivada.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Editar recurrente' }));
    expect(onEdit).toHaveBeenCalled();
  });
});
