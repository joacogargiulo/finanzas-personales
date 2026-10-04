// Descargar un archivo generado en el navegador (SRS 8). Las descargas dentro del APK se
// verifican en la Fase 8.

/**
 * Descarga `blob` con el nombre `fileName`: crea una dirección temporal (`blob:`) que apunta al
 * contenido en memoria y la abre con un enlace `<a download>`, como si el usuario lo tocara.
 */
export function downloadFile(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Se libera la memoria un rato después: algunos navegadores empiezan la descarga recién
  // cuando termina el evento del click.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
