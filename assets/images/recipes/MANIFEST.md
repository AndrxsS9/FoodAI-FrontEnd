# Manifiesto de imágenes de referencia de recetas (Bloques 3A–3E y Corrección 1)

## Estado actual (archivos verificados el 2026-11-05; política de preview añadida en la Corrección 1)

- Archivos generados: 16 de 16
- Archivos presentes y verificados técnicamente: 16 de 16
- Origen por grupo:
  - 3 de Google Gemini, conservadas sin cambios: `soup`, `cream-soup`, `salad`
  - 8 del collage de ChatGPT con corrección técnica de borde (Bloque 3D, autorizada por el
    responsable como corrección técnica, no como aprobación de uso): `rice-dish`, `beef-stew`,
    `legumes`, `arepa`, `potatoes`, `sauteed-vegetables`, `dessert`, `beverage`
  - 5 regeneradas individualmente en ChatGPT e instaladas manualmente por el responsable
    (Bloque 3E), en sustitución de sus versiones del collage: `pasta`, `eggs`, `chicken`, `fish`,
    `sandwich`
- Pendientes de regeneración: 0 de 16
- Revisión visual técnica (asistente de IA, no humana): 16 de 16 — con observaciones (ver tabla)
- Revisión visual humana: 16 de 16 — el responsable del proyecto las considera aceptables para la
  fase de pruebas del MVP (decisión comunicada en la Corrección 1). **No es una aprobación
  comercial** y no se registra en `RECIPE_IMAGE_APPROVALS`.
- Habilitados en preview interno: 16 de 16 — solo en builds del perfil EAS `preview`
- Aprobados para producción: 0 de 16

Copia de seguridad, fuera del repositorio, de los 16 archivos tal como estaban antes del Bloque 3D
(incluye las versiones del collage de las 5 imágenes reemplazadas en el Bloque 3E) y de las 13
previsualizaciones del Bloque 3D, con SHA-256 y hoja de contacto:
`C:\Users\Crist\Downloads\FoodAI-image-backups\2026-11-05-block3d\`.

### Política de visualización

| Nivel | Qué incluye | Dónde se muestra |
|---|---|---|
| Verificado técnicamente | Los 16 registros de `RECIPE_IMAGE_ASSET_RECORDS` (archivo, ruta, `require()` estático, SHA-256, procedencia) | — |
| Habilitado en preview interno | Los 16 registros verificados, **sin** aprobación (`buildRecipeImagePreviewCatalog`) | Solo builds con `EXPO_PUBLIC_APP_VARIANT=preview` **y** `EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED=true` (perfil EAS `preview`, APK interno) |
| Aprobado para producción | Solo claves con aprobación humana completa en `RECIPE_IMAGE_APPROVALS` (`buildRecipeImageCatalog`) | Todos los demás builds, incluido `production` |

- La política se resuelve en `src/utils/recipeImageCatalog.ts`
  (`resolveRecipeImageDisplayPolicy`) y falla en cerrado: cualquier valor ausente, distinto o mal
  escrito (`TRUE`, `1`, espacios, variante `production` o `development`) aplica la política de
  producción.
- `eas.json` fija `preview`/`true` en el perfil `preview` y `production`/`false` en el perfil
  `production`. Estas variables son públicas (`EXPO_PUBLIC_`): no son una credencial, solo una
  configuración de compilación.
- El preview **no** crea aprobaciones ni modifica `RECIPE_IMAGE_APPROVALS`: el catálogo de
  producción sigue vacío también dentro de un APK de preview.
- **En builds de producción y en desarrollo local sin esas dos variables, ninguna imagen se
  muestra mientras no exista aprobación humana**: toda receta real usa el respaldo neutro de
  `RecipeImage`.

Estas imágenes son **imágenes de referencia de una categoría de plato**, no fotos del plato
generado por la IA de recetas. La app lo indica con la insignia visible "Imagen de referencia" y en
la etiqueta de accesibilidad.

### Significado de cada nivel

| Nivel | Qué significa | Quién lo da |
|---|---|---|
| Generado | El archivo existe y su origen está documentado | Proceso de generación |
| Verificado técnicamente | Firma RIFF/WEBP, decodifica, 1600×900, RGB sin alfa, ≤ 150 KiB, SHA-256 registrado | Pruebas automáticas (`__tests__/recipeImageCatalog.test.ts`) |
| Revisión visual técnica | Inspección de relevancia, defectos, recortes, texto y marcas de agua | Asistente de IA (no sustituye la revisión humana) |
| Aprobado para producción | Una persona responsable revisó el archivo exacto y autoriza su uso comercial | Responsable del proyecto, registrado en `RECIPE_IMAGE_APPROVALS` |

## Procedencia real

| Archivos | Proveedor | Flujo | Datos no documentados |
|---|---|---|---|
| `soup.webp`, `cream-soup.webp`, `salad.webp` | Google Gemini (generación de imágenes) | Generación individual por imagen, convertida a WebP 1600×900 | Modelo exacto, fecha de generación, servicio usado (API o aplicación) |
| `rice-dish.webp`, `beef-stew.webp`, `legumes.webp`, `arepa.webp`, `potatoes.webp`, `sauteed-vegetables.webp`, `dessert.webp`, `beverage.webp` | OpenAI (generación de imágenes en ChatGPT) | Una única composición fotográfica (collage) de 13 platos, separada en recortes, redimensionada a 1600×900 y convertida a WebP. Corrección técnica del Bloque 3D: eliminadas las 12 filas inferiores (costura del collage) y 10,7 px por lado, reescalado 1,35 % a 1600×900 (LANCZOS) y recodificación WebP | Modelo exacto, fecha de generación, resolución original del collage |
| `pasta.webp`, `eggs.webp`, `chicken.webp`, `fish.webp`, `sandwich.webp` | OpenAI (generación de imágenes en ChatGPT) | Generación individual por imagen (no collage), redimensionada a 1600×900 y convertida a WebP para FoodAI; instaladas manualmente por el responsable (Bloque 3E) | Modelo exacto, fecha de generación, resolución original |

No hay autor humano, contrato de licencia, URL de origen ni fecha de aprobación registrados para
ningún archivo. No se han inventado.

### Términos de uso a revisar por el responsable (consultados el 2026-11-05)

- **Google Gemini API — Términos adicionales** (https://ai.google.dev/gemini-api/terms, vigentes
  desde el 23-03-2026): Google indica que no reclama la propiedad del contenido generado, pero
  puede generar contenido igual o similar para otros; el usuario es responsable del uso. Los
  servicios están dirigidos a uso profesional o comercial por desarrolladores; en los servicios no
  pagados Google puede usar las entradas y salidas para mejorar sus productos. Si las imágenes se
  generaron en la **aplicación** Gemini y no en la API, aplican otros términos (Términos de Servicio
  de Google y avisos de Gemini Apps): hay que confirmarlo.
- **OpenAI — Términos de uso** (https://openai.com/policies/terms-of-use/): según su redacción
  publicada, entre el usuario y OpenAI el usuario es propietario del resultado y OpenAI le cede sus
  derechos sobre él, "si los hubiera"; el resultado puede no ser único; no se debe presentar un
  resultado generado por IA como creado por una persona. Aplica a las 13 imágenes de ChatGPT
  (collage e individuales). La versión vigente debe leerse directamente antes de aprobar.
- **Advertencias comunes**: la protección por derechos de autor de imágenes generadas
  íntegramente por IA es incierta en muchas jurisdicciones (otros podrían usar imágenes
  similares); las imágenes de Gemini incorporan la marca de agua invisible SynthID; los
  metadatos C2PA/EXIF que hubiera no se conservaron en los WebP (ninguno de los 16 contiene EXIF,
  XMP ni ICC). Ninguno de los dos términos exige atribución visible, según la lectura anterior; la
  app ya presenta las imágenes como "Imagen de referencia" y no como fotos reales. Esta lectura no
  es asesoría legal.

## Verificación técnica y revisión visual (asistente de IA)

Nitidez: pérdida de alta frecuencia al reducir a la mitad (valores más bajos = menos detalle
real). Las 8 imágenes del collage corregidas muestran 0,37–0,84 (recortes de ~500 px ampliados
~3×, estimación heurística); las 5 regeneradas individualmente muestran 1,06–1,73, al nivel de
`soup` (1,65) y `salad` (2,48): tienen detalle real a 1600×900.

| # | Clave | Archivo | Bytes | Origen | Contenido | Observaciones |
|---|---|---|---|---|---|---|
| 1 | `soup` | `soup.webp` | 131 112 | Gemini | Sopa de verduras en tazón blanco | Correcta. Nítida. |
| 2 | `cream-soup` | `cream-soup.webp` | 77 740 | Gemini | Crema de ahuyama/zanahoria | Correcta. |
| 3 | `salad` | `salad.webp` | 148 276 | Gemini | Ensalada de hojas, pepino, tomate | Correcta. Nítida. |
| 4 | `rice-dish` | `rice-dish.webp` | 140 100 | ChatGPT (collage) + corrección 3D | Arroz con zanahoria y arvejas | Correcta. Costura inferior corregida (3D). Ampliación visible (textura blanda); plato cortado arriba/abajo. |
| 5 | `pasta` | `pasta.webp` | 140 954 | ChatGPT (individual, 3E) | Penne con salsa de tomate en trozos, cebolla y albahaca | Correcta: salsa de tomate sin carne. Nítida. Plato muy cerca del borde superior e inferior. |
| 6 | `eggs` | `eggs.webp` | 145 120 | ChatGPT (individual, 3E) | Huevos revueltos con cebollín y pimienta | Correcta: sin pan. Nítida. |
| 7 | `chicken` | `chicken.webp` | 145 406 | ChatGPT (individual, 3E) | Pechuga a la plancha en lonchas con espárragos y tomate | Correcta: guarnición discreta. Nítida. |
| 8 | `beef-stew` | `beef-stew.webp` | 137 902 | ChatGPT (collage) + corrección 3D | Guiso de res con papa y zanahoria | Correcta. Costura inferior corregida (3D). Tazón cortado arriba. Ampliación visible. |
| 9 | `fish` | `fish.webp` | 147 302 | ChatGPT (individual, 3E) | Filete de pescado blanco escamoso con limón, espárragos y papas | Correcta: se reconoce como pescado. Nítida. Guarnición moderada. |
| 10 | `legumes` | `legumes.webp` | 148 628 | ChatGPT (collage) + corrección 3D | Guiso de legumbres con zanahoria | Correcta. Costura inferior corregida (3D). Tazón cortado arriba. |
| 11 | `arepa` | `arepa.webp` | 138 962 | ChatGPT (collage) + corrección 3D | Dos arepas de maíz asadas | Correcta. Costura inferior (la más marcada) corregida (3D). |
| 12 | `sandwich` | `sandwich.webp` | 142 582 | ChatGPT (individual, 3E) | Sándwich integral cortado en diagonal con jamón, queso, lechuga, tomate, pepino y cebolla | Correcta: relleno variado y discreto, margen superior suficiente. Nítida. |
| 13 | `potatoes` | `potatoes.webp` | 142 530 | ChatGPT (collage) + corrección 3D | Papas asadas con perejil | Correcta. Costura inferior corregida (3D). Tazón cortado arriba. |
| 14 | `sauteed-vegetables` | `sauteed-vegetables.webp` | 145 010 | ChatGPT (collage) + corrección 3D | Brócoli, pimentón, zanahoria, calabacín | Correcta. Costura inferior corregida (3D). |
| 15 | `dessert` | `dessert.webp` | 56 002 | ChatGPT (collage) + corrección 3D | Flan con caramelo | Correcta (flan es un ejemplo admitido). Costura inferior corregida (3D). |
| 16 | `beverage` | `beverage.webp` | 65 888 | ChatGPT (collage) + corrección 3D | Batido de fresa y banano | Correcta (bebida natural de fruta). Costura inferior corregida (3D). Borde del vaso cerca del borde superior. |

Ninguna imagen contiene texto, logotipos, marcas de agua visibles, personas ni manos. La zona
superior izquierda está despejada en las 16. Ninguna de las 5 imágenes del Bloque 3E presenta
costuras ni artefactos en sus cuatro bordes (la zona oscura del borde inferior central es la
sombra real del plato).

**Consistencia de estilo**: hay tres familias visuales. Las 3 de Gemini (luz de ventana,
servilleta de lino, cubiertos, encuadre amplio); las 8 del collage (mesa clara, plato moteado,
ramita de perejil arriba a la derecha, tonos cálidos y saturados, encuadre cerrado, textura blanda);
y las 5 del Bloque 3E (plato blanco liso, luz suave, nítidas). Las 5 del Bloque 3E **comparten el
mismo fondo de mesa**, incluido el mismo nudo de madera abajo a la izquierda (correlación
0,80–0,91 en esa zona): es una repetición visible si se muestran juntas, no un defecto técnico.

**Costura del collage**: corregida en las 8 imágenes del collage que permanecen (Bloque 3D). Las 5
que la conservaban fueron reemplazadas por generaciones individuales en el Bloque 3E, por lo que
ninguna imagen actual contiene la costura.

### Requisitos pendientes

- **Revisión visual humana** de las 16 imágenes definitivas.
- **Aprobación de uso** por el responsable, imagen por imagen, tras revisar los términos de Google
  y OpenAI (confirmar si las 3 de Gemini se generaron con la API o con la aplicación).
- **Calidad opcional**: las 8 del collage siguen siendo ampliaciones (~3×) con textura más blanda
  que las otras 8; regenerarlas individualmente unificaría nitidez y estilo. Requiere autorización
  si implica un servicio de pago.

## Especificación técnica común

| Aspecto | Requisito |
|---|---|
| Formato | WebP (`.webp`), sin transparencia |
| Nombre | Exactamente `<clave>.webp` (tabla anterior), en esta carpeta |
| Dimensiones | 1600 × 900 px (16:9) |
| Encuadre | Se recorta con `cover` (contenedores de 180–220 dp de alto a todo el ancho). El plato debe quedar centrado dentro de la franja central de 1600 × 800 px |
| Peso objetivo | ≤ 150 KiB por archivo |
| Estilo | Fotografía cenital o a 45°, luz natural, fondo neutro claro, coherente entre categorías |
| Zona superior izquierda | Sin detalles críticos: ahí se superpone la insignia "Imagen de referencia" |
| Zona superior derecha / inferior | Sin texto ni logotipos: ahí van la insignia de conveniencia y el título |
| Contenido prohibido | Texto, marcas, logotipos, personas identificables, marcas de agua visibles |

## Contenido esperado por categoría

Regla general: mostrar el **tipo de plato** de forma genérica, sin un ingrediente protagonista que
pueda contradecir una receta concreta de esa categoría.

| Clave | Categoría | Debe mostrar | No debe mostrar | Ejemplos que se asignan |
|---|---|---|---|---|
| `soup` | Sopa | Sopa/caldo con trozos de verduras | Proteína muy visible, crema lisa | Sopa de lentejas, Sancocho, Ajiaco |
| `cream-soup` | Crema | Crema lisa de verdura | Trozos grandes, postres cremosos | Crema de ahuyama |
| `salad` | Ensalada | Hojas verdes y verduras crudas | Frutas como protagonista | Ensalada de atún |
| `rice-dish` | Arroz | Arroz salado con verduras pequeñas | Arroz dulce, mariscos visibles | Arroz con pollo |
| `pasta` | Pasta | Pasta con salsa roja suave | Carne o mariscos destacados | Pasta con tomate |
| `eggs` | Huevos | Huevos revueltos o tortilla | Huevos crudos, pan protagonista | Huevos pericos, Tortilla de papa |
| `chicken` | Pollo | Pollo cocinado, guarnición discreta | Pollo crudo, alitas tipo comida rápida | Pollo al horno |
| `beef-stew` | Carne guisada | Carne de res en salsa | Filetes asados, carne cruda | Carne guisada, Estofado de res |
| `fish` | Pescado | Filete de pescado blanco cocinado | Pescado crudo o entero, mariscos | Tilapia al horno |
| `legumes` | Legumbres | Frijoles o lentejas guisados | Carne protagonista | Lentejas guisadas |
| `arepa` | Arepa | Arepa de maíz dorada | Rellenos llamativos | Arepa con queso |
| `sandwich` | Sándwich | Sándwich de pan tajado | Hamburguesa, wrap | Sándwich de pollo |
| `potatoes` | Papas y tubérculos | Papas cocidas o al horno | Papas fritas de comida rápida | Papas al horno, Puré de papa |
| `sauteed-vegetables` | Verduras salteadas | Verduras mixtas salteadas | Carne o fideos destacados | Verduras salteadas |
| `dessert` | Postre | Postre casero (arroz con leche, natilla, flan) | Pastel de cumpleaños, marcas | Arroz con leche, Flan |
| `beverage` | Bebida | Bebida natural de fruta en vaso | Alcohol, marcas | Jugo de mora, Limonada |

Recetas sin coincidencia fiable (p. ej. "Ensalada de frutas", "Arroz dulce", "Pastel de pollo",
"Mousse de salmón", "Carne asada") **no** reciben imagen: muestran el respaldo neutro.

## Cómo aprobar una imagen para producción

Solo el responsable del proyecto, después de revisar visualmente el archivo exacto y los términos
del proveedor, añade una entrada en `RECIPE_IMAGE_APPROVALS` (`src/utils/recipeImageCatalog.ts`):

```ts
soup: {
  approvedBy: '<nombre real de la persona responsable>',
  approvedOn: 'AAAA-MM-DD',
  sha256: '<SHA-256 del archivo revisado, igual al de RECIPE_IMAGE_ASSET_RECORDS>',
},
```

Reglas: no usar marcadores, nombres de equipo genéricos ni aprobaciones simuladas (las pruebas
los rechazan); si un archivo se reemplaza, su SHA-256 cambia y la aprobación anterior deja de
activarlo; después de aprobar, actualizar la línea "Aprobados para producción" de este manifiesto
(las pruebas comprueban que coincida con el catálogo).
