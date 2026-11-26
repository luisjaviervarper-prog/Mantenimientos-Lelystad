// Envío de archivos por WhatsApp / correo con el menú de compartir del móvil (Web Share API).
export function puedeCompartirArchivos(files) {
  try { return !!(navigator.canShare && navigator.canShare({ files })); } catch { return false; }
}

export function descargar(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// canal: 'whatsapp' | 'correo' | 'guardar'
// Devuelve 'compartido' | 'cancelado' | 'descargado'
export async function enviar({ files, titulo, texto, canal, destinatario = '' }) {
  if (canal !== 'guardar' && puedeCompartirArchivos(files)) {
    try {
      await navigator.share({ files, title: titulo, text: texto });
      return 'compartido';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelado';
      // otros errores: seguimos con la alternativa
    }
  }
  files.forEach(descargar);
  if (canal === 'whatsapp') {
    window.open('https://wa.me/?text=' + encodeURIComponent(texto + '\n(Adjunta el archivo descargado: ' + files.map(f => f.name).join(', ') + ')'), '_blank');
  } else if (canal === 'correo') {
    location.href = 'mailto:' + encodeURIComponent(destinatario) + '?subject=' + encodeURIComponent(titulo) +
      '&body=' + encodeURIComponent(texto + '\n\nAdjunta el archivo descargado: ' + files.map(f => f.name).join(', '));
  }
  return 'descargado';
}

export function tamano(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
