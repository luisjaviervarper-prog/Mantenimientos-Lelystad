# OSMOS Mantenimiento

App web instalable (PWA) para hacer en obra los mantenimientos de MT y BT siguiendo los guiones del Departamento Técnico, y generar el informe en PDF con formato OSMOS.

- Entrada con **huella / Face ID** (y PIN de 6 cifras de respaldo).
- Guiones de **Sabón, Laracha (MT y BT)** y **Lelystad (MT y BT)**, paso a paso, con fotos, medidas, C/I/N/A, firmas y defectos.
- Criterios de aceptación: la medida que no cumple se marca en rojo y obliga a abrir un defecto.
- **Idioma:** la app está siempre en castellano. Los informes de **Lelystad salen en inglés** (pasos, fases, defectos, criterios, medidas, resumen y CSV) y los de Sabón y Laracha en castellano.
- **Informe PDF** con logo, colores OSMOS, fotos, defectos y firmas.
- Envío del informe (y de los datos en CSV) **por WhatsApp o correo**.
- **Copia de seguridad completa** (.zip con datos y fotos) que se envía por WhatsApp, y restauración.
- Funciona **sin conexión** una vez abierta la primera vez.
- Sin servidor y sin dependencias externas: todo se guarda en el móvil.

## 1. Publicar en GitHub Pages

1. Crea un repositorio en GitHub (recomendado **privado**, porque contiene nombres de clientes y guiones internos; publicar Pages desde un repositorio privado necesita un plan de pago de GitHub).
2. Sube **todo el contenido de esta carpeta** a la raíz del repositorio (rama `main`).
   - Desde la web: *Add file → Upload files* y arrastra todas las carpetas y archivos.
   - O con git: `git init && git add . && git commit -m "OSMOS Mantenimiento" && git branch -M main && git remote add origin https://github.com/<usuario>/<repo>.git && git push -u origin main`
3. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. En 1–2 minutos la app estará en `https://<usuario>.github.io/<repo>/`. Ese es el enlace que se manda a los técnicos.

> La huella y la cámara solo funcionan con **HTTPS** (GitHub Pages ya lo da).

## 2. Instalar en el móvil

- **Android (Chrome):** abrir el enlace → menú ⋮ → *Instalar aplicación* / *Añadir a pantalla de inicio*.
- **iPhone (Safari):** abrir el enlace → botón Compartir → *Añadir a pantalla de inicio*.

La primera vez se registra el técnico (nombre, empresa, correo, teléfono y PIN) y se activa la huella.

## 3. Uso

1. **Nuevo mantenimiento** → instalación, guion (MT/BT), centro o zona (lista, texto o QR), nº de OT, fecha y equipo.
2. Se recorren las **fases**. Cada paso pide lo que marca el guion:
   - **FOTO** obligatoria (con fecha, hora y GPS), **C/I/N/A**, **medidas** con unidad y equipo usado, **Sí/No**, observaciones, selección, firma.
   - **I** (incorrecto), **KO** o una **medida fuera de criterio** obligan a abrir un defecto con foto.
   - **A** (corregido) pide foto del antes y del después.
   - Los pasos de **con corte** se saltan solos si se elige «Sin corte».
   - Si un paso no aplica: «No procede este paso».
3. Fases repetibles: **celdas, trafos, cuadros y luminarias** se añaden una a una (con QR si el lector del navegador lo permite).
4. **Informe** → *Generar informe PDF* → *Enviar por WhatsApp* / *Enviar por correo* / *Guardar en el móvil*.
5. **Ajustes**: equipos de medida y caducidad de calibración (avisa si está caducada), personal designado VP/VOP (Lelystad), destinatario por defecto, copia de seguridad y restauración.
6. **Lelystad:** los textos que escribe el técnico (observaciones, descripción y propuesta de los defectos) se copian tal cual al informe, así que la app avisa de que se escriban en inglés.

## 4. Cómo funcionan WhatsApp, el correo y la huella

- **WhatsApp y correo:** se usa el menú de compartir del móvil (Web Share API). Se elige WhatsApp, Outlook o Gmail y el contacto o grupo, y el PDF va adjunto. En navegadores que no permiten compartir archivos (algunos de ordenador), el archivo se descarga y se abre WhatsApp Web o el correo con el texto preparado para adjuntarlo a mano.
- **Huella:** se usa WebAuthn (la huella o Face ID del propio móvil). Al no haber servidor, protege el acceso **en ese móvil**; no es un usuario centralizado. Si se cambia de móvil, se restaura la copia de seguridad y se registra de nuevo.
- **Datos:** quedan en el navegador del móvil (IndexedDB). Si se borran los datos del navegador o se desinstala la app, se pierden: por eso la app recuerda hacer copia cada 7 días.

## 5. Cambiar los guiones, criterios y defectos

Los pasos no están en el código, están en archivos JSON:

| Archivo | Contenido |
|---|---|
| `data/guiones/sabon-laracha-mt.json` | Guion MT Sabón y Laracha |
| `data/guiones/sabon-laracha-bt.json` | Guion BT Sabón y Laracha |
| `data/guiones/lelystad-mt.json` | Guion MT Lelystad |
| `data/guiones/lelystad-bt.json` | Guion BT Lelystad |
| `data/defectos.json` | Catálogos de defectos y gravedades (Muy grave/Grave/Leve y A/B/C/D) |
| `data/criterios.json` | Límites de las medidas |
| `data/instalaciones.json` | Instalaciones, centros, zonas y preguntas del LMRA |
| `data/i18n/en.json` | Traducciones al inglés para los informes de Lelystad |

Se pueden editar directamente en GitHub (icono del lápiz). Cada paso tiene `texto` y una lista de `campos` (`FOTO`, `CINA`, `MED`, `SINO`, `TXT`, `SEL`, `ID`, `OKKO`, `FIRMA`, `LMRA`, `ROLES`, `RESUMEN`, `DEFECTOS`).

**Traducción al inglés (informes de Lelystad):** `data/i18n/en.json` es un diccionario `"texto en castellano": "texto en inglés"`. Si cambias o añades un paso, defecto, opción o zona de Lelystad, añade aquí su traducción con el texto en castellano **exactamente igual**; si falta, ese texto saldrá en castellano en el informe.

También se pueden regenerar desde los `.docx` de Óscar (`docs/`):

```bash
pip install python-docx
python3 tools/docx_a_json.py "docs/Guiones de mantenimiento MT y BT – Sabón y Laracha.docx" tools/tmp_sabon.json x
python3 tools/docx_a_json.py "docs/Guiones de mantenimiento MT y BT – Lelystad.docx" tools/tmp_lelystad.json x
python3 tools/generar_guiones.py
```

**Importante:** después de cualquier cambio, sube el número de `VERSION` en `sw.js` (por ejemplo `osmos-mant-v1.0.5`). Si no, los móviles siguen usando la versión guardada sin conexión.

## 6. Pendiente de revisar

- Los criterios marcados como «criterio Osmos» en los guiones son propuestas: revisar en `data/criterios.json`.
- Las preguntas del **LMRA** son una propuesta: cambiarlas en `data/instalaciones.json` (campo `lmra` de Lelystad).
- Revisar la traducción técnica al inglés de `data/i18n/en.json` (términos como WV/IV, VP/VOP, GnO se han dejado como en Lelystad).
- El logo de `assets/logo-osmos.png` es el de la firma de correo (pequeño). Conviene sustituirlo, y los iconos de `assets/icons/`, por versiones de alta resolución.
- Lectura de QR: funciona en Chrome Android; en iPhone (Safari) se escribe el código a mano.
- La copia de seguridad no va cifrada: quien tenga el .zip ve los datos.

## 7. Estructura

```
index.html, manifest.webmanifest, sw.js   App, instalación y modo sin conexión
css/app.css                                Estilo OSMOS (#003A69 azul, #EBAB00 ámbar)
js/app.js                                  Pantallas
js/auth.js                                 Huella (WebAuthn) y PIN
js/guion.js                                Reglas: validación, criterios, resumen
js/pdf.js                                  Informe PDF (pdf-lib, incluida en vendor/)
js/zip.js, js/share.js, js/db.js, js/fotos.js, js/i18n.js
data/                                      Guiones y catálogos (JSON)
docs/                                      Guiones originales (.docx)
tools/                                     Conversión .docx → JSON
```

pdf-lib © Andrew Dillon, licencia MIT (`vendor/pdf-lib-LICENSE.md`).
