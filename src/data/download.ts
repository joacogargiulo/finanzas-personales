// Descargar un archivo generado en el navegador (SRS 8). También funciona dentro del APK: los
// archivos van a la carpeta Descargas del celular (ADR 0028).

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
