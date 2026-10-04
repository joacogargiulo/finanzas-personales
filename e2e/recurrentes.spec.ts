import { expect, test } from '@playwright/test';
import { createAccount, signIn } from './helpers';

// Recurrentes (SRS 5.10): se crean en Ajustes, aparecen en Inicio cuando llega la fecha y no
// se cargan solos. Confirmar abre el panel precargado; al guardar, el movimiento queda en el
// historial y la ocurrencia deja de estar pendiente.
test('crear un recurrente y confirmarlo desde Inicio', async ({ page }) => {
  await signIn(page);
  await createAccount(page, 'Banco', '500000');

  // Un gasto mensual que empieza hoy: la primera ocurrencia ya está pendiente.
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: '+ Añadir recurrente' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nuevo recurrente' });
  await sheet.getByLabel(/^Monto/).fill('250000');
  await sheet.getByRole('button', { name: 'Servicios' }).click();
  await sheet.getByLabel('Descripción (opcional)').fill('Alquiler');
  await sheet.getByRole('button', { name: 'Crear recurrente' }).click();
  await expect(sheet).toBeHidden();
  const settings = page.getByRole('region', { name: 'Recurrentes' });
  await expect(settings.getByText('Alquiler')).toBeVisible();
  await expect(settings.getByText(/Mensual · Próximo:/)).toBeVisible();

  // Inicio lo muestra arriba de todo.
  await page.getByRole('link', { name: 'Inicio' }).click();
  const pending = page.getByRole('region', { name: /Pendientes de confirmar/ });
  await expect(pending.getByText('Alquiler')).toBeVisible();
  await pending.getByRole('button', { name: 'Confirmar' }).click();

  // El panel llega precargado; se ajusta el monto antes de guardar.
  const confirm = page.getByRole('dialog', { name: 'Confirmar recurrente' });
  await expect(confirm.getByLabel(/^Monto:/)).toContainText('250.000');
  await confirm.getByRole('button', { name: 'Borrar' }).click();
  await confirm.getByRole('button', { name: 'Guardar gasto' }).click();
  await expect(confirm).toBeHidden();
  await expect(pending).toBeHidden();

  // El movimiento está en el historial y el saldo bajó.
  const accounts = page.getByRole('region', { name: 'Cuentas' });
  await expect(accounts.getByText('$ 475.000,00')).toBeVisible();
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page.getByText('Alquiler')).toBeVisible();
});
