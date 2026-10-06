import { expect, test } from './fixtures';
import { createAccount, signIn } from './helpers';

// El ojo del patrimonio (issue #42): oculta el patrimonio y los saldos en Inicio y en Ajustes, y
// la app se acuerda al volver a abrirla. Los movimientos se siguen viendo.
test('ocultar el patrimonio y los saldos, y que se recuerde', async ({ page }) => {
  await signIn(page);
  await createAccount(page, 'Efectivo', '12345');
  const wealth = page.getByRole('region', { name: 'Patrimonio estimado' });
  await expect(wealth).toContainText('12.345');

  await page.getByRole('button', { name: 'Ocultar saldos' }).click();
  await expect(wealth).not.toContainText('12.345');
  const accounts = page.getByRole('region', { name: 'Cuentas' });
  await expect(accounts).not.toContainText('12.345');
  await expect(accounts.getByLabel('Monto oculto')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Mostrar saldos' })).toBeVisible();
  await expect(wealth).not.toContainText('12.345');

  await page.getByRole('link', { name: 'Ajustes' }).click();
  await expect(page.getByRole('region', { name: 'Cuentas' })).not.toContainText('12.345');

  await page.getByRole('link', { name: 'Inicio' }).click();
  await page.getByRole('button', { name: 'Mostrar saldos' }).click();
  await expect(wealth).toContainText('12.345');
});
