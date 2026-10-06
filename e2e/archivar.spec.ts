import { expect, test } from './fixtures';
import { addExpense, createAccount, signIn } from './helpers';

// Archivar cuentas desde Ajustes (SRS 5.5): con saldo se bloquea (TC-06); con saldo 0 se
// archiva con confirmación reforzada, desaparece de Inicio y sus movimientos siguen en el
// historial (TC-07).
test('archivar cuentas: bloqueado con saldo, permitido en 0 (TC-06 y TC-07)', async ({ page }) => {
  await signIn(page);
  await createAccount(page, 'Banco', '5000');
  await createAccount(page, 'Efectivo', '1000');
  // Efectivo queda en 0, pero con un movimiento.
  await addExpense(page, 'Efectivo', '1000', 'Comida');

  await page.getByRole('link', { name: 'Ajustes' }).click();

  // TC-06: Banco tiene saldo.
  await page.getByRole('button', { name: 'Acciones de Banco' }).click();
  await page.getByRole('menuitem', { name: 'Archivar' }).click();
  const blocked = page.getByRole('dialog', { name: 'No se puede archivar' });
  await expect(blocked).toContainText('Transferilo a otra cuenta antes de archivarla.');
  await blocked.getByRole('button', { name: 'Entendido' }).click();
  await expect(blocked).toBeHidden();

  // TC-07: Efectivo está en 0. Hay que escribir el nombre para confirmar.
  await page.getByRole('button', { name: 'Acciones de Efectivo' }).click();
  await page.getByRole('menuitem', { name: 'Archivar' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Archivar Efectivo?' });
  const archive = confirm.getByRole('button', { name: 'Archivar' });
  await expect(archive).toBeDisabled();
  await confirm.getByLabel(/Para confirmar, escribí/).fill('Efectivo');
  await archive.click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText('Cuentas archivadas (1)')).toBeVisible();

  // Ya no está en Inicio…
  await page.getByRole('link', { name: 'Inicio' }).click();
  const accounts = page.getByRole('region', { name: 'Cuentas' });
  await expect(accounts.getByText('Banco')).toBeVisible();
  await expect(accounts.getByText('Efectivo')).toBeHidden();

  // …pero su movimiento sigue en el historial, marcado.
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page.getByText('archivada')).toBeVisible();
});
