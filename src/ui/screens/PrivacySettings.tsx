// Sección "Privacidad" de Ajustes (SRS 7.4, ADR 0029): en lugar de una política pública, qué
// datos salen del dispositivo y a dónde, en lenguaje simple.
// Cuando se sume un servicio nuevo hay que agregarlo acá: Meta con WhatsApp (Fase 11).

interface Destination {
  name: string;
  what: string;
}

const DESTINATIONS: readonly Destination[] = [
  {
    name: 'Firebase (Google)',
    what:
      'Tus cuentas, movimientos, categorías, presupuestos y recurrentes se guardan en los ' +
      'servidores de Firestore, para sincronizarlos entre tus dispositivos. Las reglas de ' +
      'seguridad hacen que solo vos puedas leerlos y modificarlos desde la app. Quien administra ' +
      'el proyecto de Firebase puede verlos desde la consola.',
  },
  {
    name: 'Inicio de sesión con Google',
    what: 'La app recibe tu nombre y tu email. Nunca ve tu contraseña.',
  },
  {
    name: 'Bluelytics',
    what: 'Solo se pide la cotización del dólar y el euro blue. No se manda ningún dato tuyo.',
  },
  {
    name: 'Google Sheets',
    what:
      'Solo si exportás. La hoja se crea en tu Google Drive y el permiso que das alcanza ' +
      'únicamente a esa hoja.',
  },
  {
    name: 'Dictado por voz',
    what:
      'El reconocimiento de voz de Chrome (Google) procesa el audio cuando tocás el micrófono. ' +
      'La app recibe solo el texto.',
  },
  {
    name: 'Cloudflare (IA del dictado)',
    what:
      'Con conexión, el texto dictado se manda a una IA (Llama, en Cloudflare Workers AI) para ' +
      'entenderlo, junto con los nombres de tus cuentas y categorías. Nunca montos ni saldos. ' +
      'No se guarda, y Cloudflare no lo usa para entrenar modelos.',
  },
];

export function PrivacySettings() {
  return (
    <section className="card" aria-labelledby="privacy-title">
      <h2 id="privacy-title" className="card-title">
        Privacidad
      </h2>
      <p className="field-hint">
        Sin publicidad ni analíticas: nadie sigue lo que hacés en la app.
      </p>
      <details className="privacy">
        <summary>Qué datos salen de este dispositivo y a dónde</summary>
        <dl className="privacy-list">
          {DESTINATIONS.map((destination) => (
            <div key={destination.name}>
              <dt>{destination.name}</dt>
              <dd>{destination.what}</dd>
            </div>
          ))}
        </dl>
        <h3 className="section-label">En este dispositivo</h3>
        <p className="field-hint">
          Una copia de tus datos, para que la app funcione sin conexión, que se borra al cerrar
          sesión. También quedan el tema elegido y las últimas cotizaciones, que no dicen nada de
          vos.
        </p>
        <h3 className="section-label">Si querés irte</h3>
        <p className="field-hint">
          &quot;Borrar mi cuenta&quot;, al final de Ajustes, borra todos tus datos de la app. No
          toca tu cuenta de Google ni la hoja de Sheets que hayas exportado.
        </p>
      </details>
    </section>
  );
}
