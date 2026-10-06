// Digital Asset Links del APK (SRS 9.3, ADR 0028). Si el assetlinks.json publicado no coincide
// con el paquete del proyecto de Bubblewrap, el APK abre con la barra de direcciones: estos
// tests lo detectan en el CI, antes de publicar.

import { describe, expect, it } from 'vitest';
import assetlinksRaw from '../../public/.well-known/assetlinks.json?raw';
import twaManifestRaw from '../../android/twa-manifest.json?raw';

interface AssetLink {
  relation: string[];
  target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
}

const assetlinks = JSON.parse(assetlinksRaw) as AssetLink[];
const twaManifest = JSON.parse(twaManifestRaw) as { packageId: string; host: string };

describe('assetlinks.json', () => {
  // La forma que exige Android: una lista con una relación que delega todas las URLs del
  // sitio a la app.
  it('delega el sitio a una app Android', () => {
    expect(assetlinks).toHaveLength(1);
    const [link] = assetlinks;
    expect(link?.relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(link?.target.namespace).toBe('android_app');
  });

  // El paquete tiene que ser el mismo que el de android/twa-manifest.json: si alguien cambia
  // uno y se olvida del otro, la verificación falla en el celular.
  it('usa el paquete del proyecto de Bubblewrap', () => {
    expect(assetlinks[0]?.target.package_name).toBe(twaManifest.packageId);
    expect(twaManifest.packageId).toBe('ar.jtg.finanzas');
    expect(twaManifest.host).toBe('finanzas-personales-jtg.web.app');
  });

  // Una huella SHA-256 son 32 bytes escritos en hexadecimal y separados por ":".
  it('tiene una sola huella SHA-256 bien escrita', () => {
    const fingerprints = assetlinks[0]?.target.sha256_cert_fingerprints ?? [];
    expect(fingerprints).toHaveLength(1);
    expect(fingerprints[0]).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });
});
