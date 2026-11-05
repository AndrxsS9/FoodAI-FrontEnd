# Manifiesto de imágenes de referencia de recetas (Bloque 3A)

**Estado: 0 de 16 imágenes disponibles.** Ningún archivo de esta carpeta ha sido aprobado todavía.
Hasta que existan, todas las recetas reales muestran el respaldo neutro de `RecipeImage`.

Estas imágenes son **imágenes de referencia de una categoría de plato**, no fotos del plato
generado por la IA. La app lo indica con la insignia visible "Imagen de referencia" y en la
etiqueta de accesibilidad.

## Reglas de integridad (obligatorias)

1. Solo imágenes **originales** (creadas o encargadas por el equipo) o con **licencia explícita**
   que permita uso comercial y distribución empaquetada dentro de una app móvil y web.
2. Prohibido descargar fotos arbitrarias de internet, inventar licencias o usar URLs falsas.
3. Una imagen solo se registra en `src/utils/recipeImageCatalog.ts`
   (`APPROVED_RECIPE_IMAGE_ASSETS`) cuando el archivo real existe aquí **y** su licencia está
   completa. Las pruebas de integridad (`__tests__/recipeImageCatalog.test.ts`) fallan si el
   archivo falta, si la ruta no es la canónica, si no es WebP o si la licencia está incompleta.
4. Si una imagen generada con IA se usa como asset, debe tratarse como `kind: 'original'`
   solo si los términos del proveedor lo permiten, y debe revisarla una persona antes de aprobarla.

## Especificación técnica común

| Aspecto | Requisito |
|---|---|
| Formato | WebP (`.webp`), sin transparencia |
| Nombre | Exactamente `<clave>.webp` (tabla inferior), en esta carpeta |
| Dimensiones | 1600 × 900 px (16:9) |
| Encuadre | Se recorta con `cover` a ~2:1 (contenedores de 180–220 dp de alto a todo el ancho). El plato debe quedar centrado dentro de la franja central de 1600 × 800 px |
| Peso objetivo | ≤ 150 KB por archivo (≈ 2,4 MB en total para 16 imágenes) |
| Estilo | Fotografía cenital o a 45°, luz natural, fondo neutro claro, coherente entre categorías |
| Zona superior izquierda | Sin detalles críticos: ahí se superpone la insignia "Imagen de referencia" |
| Zona superior derecha / inferior | Sin texto ni logotipos: ahí van la insignia de conveniencia y el título |
| Contenido prohibido | Texto, marcas, logotipos, personas identificables, marcas de agua |

## Imágenes requeridas

Regla general de contenido: mostrar el **tipo de plato** de forma genérica, sin un ingrediente
protagonista que pueda contradecir una receta concreta de esa categoría.

| # | Clave | Archivo | Categoría | Debe mostrar | No debe mostrar | Ejemplos que se asignan |
|---|---|---|---|---|---|---|
| 1 | `soup` | `soup.webp` | Sopa | Plato hondo con sopa/caldo con trozos de verduras | Proteína muy visible (pollo entero, mariscos), crema lisa | Sopa de lentejas, Caldo de papa, Sancocho, Ajiaco |
| 2 | `cream-soup` | `cream-soup.webp` | Crema | Plato hondo con crema lisa de verdura, color neutro (ahuyama/zanahoria) | Trozos grandes, postres cremosos | Crema de ahuyama, Crema de espinaca |
| 3 | `salad` | `salad.webp` | Ensalada | Ensalada de hojas verdes y verduras crudas | Frutas como protagonista, proteína dominante | Ensalada de atún, Ensalada fresca de pepino |
| 4 | `rice-dish` | `rice-dish.webp` | Arroz | Arroz salado servido, con verduras pequeñas | Arroz dulce, arroz blanco solo, mariscos visibles | Arroz con pollo, Arroz chino, Arroz con verduras |
| 5 | `pasta` | `pasta.webp` | Pasta | Pasta corta o larga con salsa roja suave | Carne o mariscos destacados | Pasta con tomate, Espaguetis, Macarrones con queso |
| 6 | `eggs` | `eggs.webp` | Huevos | Huevos revueltos o tortilla en sartén/plato | Huevos crudos, pan como protagonista | Huevos pericos, Tortilla de papa, Omelette |
| 7 | `chicken` | `chicken.webp` | Pollo | Presas de pollo cocinado, guarnición discreta | Pollo crudo, alas fritas tipo comida rápida | Pollo al horno, Pechuga a la plancha, Sudado de pollo |
| 8 | `beef-stew` | `beef-stew.webp` | Carne guisada | Trozos de carne de res en salsa (guiso) | Filetes asados, carne cruda | Carne guisada, Estofado de res, Sudado de carne |
| 9 | `fish` | `fish.webp` | Pescado | Filete de pescado blanco cocinado | Pescado crudo/entero con cabeza, mariscos | Tilapia al horno, Filete de pescado, Salmón |
| 10 | `legumes` | `legumes.webp` | Legumbres | Plato de frijoles o lentejas guisados | Carne protagonista | Lentejas guisadas, Frijoles, Garbanzos |
| 11 | `arepa` | `arepa.webp` | Arepa | Arepa de maíz dorada, sola o con queso | Rellenos llamativos específicos | Arepa con queso, Arepas de maíz |
| 12 | `sandwich` | `sandwich.webp` | Sándwich | Sándwich de pan tajado con relleno discreto | Hamburguesa, wrap | Sándwich de pollo, Sanduche mixto |
| 13 | `potatoes` | `potatoes.webp` | Papas y tubérculos | Papas cocidas o al horno (o yuca) | Papas fritas de comida rápida | Papas al horno, Puré de papa, Yuca cocida |
| 14 | `sauteed-vegetables` | `sauteed-vegetables.webp` | Verduras salteadas | Verduras mixtas salteadas en sartén/wok | Carne o fideos destacados | Verduras salteadas, Salteado de verduras |
| 15 | `dessert` | `dessert.webp` | Postre | Postre casero en copa o plato (p. ej. arroz con leche o natilla) | Pastel de cumpleaños, marcas | Arroz con leche, Flan, Natilla, Gelatina |
| 16 | `beverage` | `beverage.webp` | Bebida | Vaso con bebida natural de fruta | Bebidas alcohólicas, marcas, café de cadena | Jugo de mora, Limonada, Batido de banano |

Recetas sin coincidencia fiable (p. ej. "Ensalada de frutas", "Arroz dulce", "Pastel de pollo",
"Mousse de salmón", "Carne asada") **no** reciben imagen: muestran el respaldo neutro.

## Registro de licencia requerido por imagen

Cada entrada de `APPROVED_RECIPE_IMAGE_ASSETS` necesita datos reales y verificables:

```ts
{
  key: 'soup',
  file: 'assets/images/recipes/soup.webp',
  source: require('../../assets/images/recipes/soup.webp'),
  license: {
    kind: 'original' | 'licensed',
    author: '<autor o estudio>',
    licenseName: '<nombre exacto de la licencia o del contrato de encargo>',
    sourceReference: '<URL de la licencia, nº de contrato o identificador del encargo>',
    acquiredOn: 'AAAA-MM-DD',
    approvedBy: '<responsable del proyecto que aprueba el uso>',
    attributionRequired: true | false,
    attributionText: '<obligatorio si attributionRequired es true>',
  },
}
```
