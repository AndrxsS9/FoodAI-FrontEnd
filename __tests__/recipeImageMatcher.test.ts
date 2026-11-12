/**
 * Bloque 3A - Clasificación conservadora de recetas en categorías de imagen de referencia.
 */
import { normalizeDishText, resolveRecipeImageKey } from '../src/utils/recipeImageMatcher';
import { RECIPE_IMAGE_KEYS, RecipeImageKey } from '../src/types/recipeImage';

const ing = (...names: string[]) => names.map((name) => ({ name }));
const key = (name: string, ingredients: { name: string }[] = []) =>
  resolveRecipeImageKey({ name, ingredients });

describe('normalizeDishText', () => {
  it('quita tildes, mayúsculas, puntuación y espacios repetidos', () => {
    expect(normalizeDishText('  Puré de PAPA, ¡casero!  ')).toBe('pure de papa casero');
    expect(normalizeDishText('Sándwich   de   atún')).toBe('sandwich de atun');
    expect(normalizeDishText(42)).toBe('');
  });
});

describe('resolveRecipeImageKey — coincidencias correctas', () => {
  const cases: [string, RecipeImageKey][] = [
    ['Sopa de lentejas', 'soup'],
    ['Caldo de papa', 'soup'],
    ['Sancocho de gallina', 'soup'],
    ['Ajiaco santafereño', 'soup'],
    ['Sopa de fideos', 'soup'],
    ['Crema de ahuyama', 'cream-soup'],
    ['Crema de espinaca', 'cream-soup'],
    ['Ensalada de atún', 'salad'],
    ['Ensalada fresca de pepino', 'salad'],
    ['Arroz con pollo y verduras', 'rice-dish'],
    ['Arroz chino', 'rice-dish'],
    ['Pasta con tomate', 'pasta'],
    ['Pasta con crema de champiñones', 'pasta'],
    ['Espaguetis a la boloñesa', 'pasta'],
    ['Macarrones con queso', 'pasta'],
    ['Huevos pericos', 'eggs'],
    ['Omelette de espinaca', 'eggs'],
    ['Pollo al horno con papas', 'chicken'],
    ['Pollo en jugo de naranja', 'chicken'],
    ['Pechuga a la plancha', 'chicken'],
    ['Sudado de pollo', 'chicken'],
    ['Filete de pollo', 'chicken'],
    ['Carne guisada', 'beef-stew'],
    ['Estofado de res', 'beef-stew'],
    ['Sudado de carne con papa', 'beef-stew'],
    ['Tilapia al horno', 'fish'],
    ['Salmón a la plancha', 'fish'],
    ['Filete de pescado', 'fish'],
    ['Lentejas guisadas', 'legumes'],
    ['Frijoles con plátano', 'legumes'],
    ['Guiso de garbanzos', 'legumes'],
    ['Arepa con queso', 'arepa'],
    ['Arepas de maíz', 'arepa'],
    ['Sándwich de pollo', 'sandwich'],
    ['Sanduche mixto', 'sandwich'],
    ['Papas al horno', 'potatoes'],
    ['Puré de papa', 'potatoes'],
    ['Yuca cocida', 'potatoes'],
    ['Verduras salteadas', 'sauteed-vegetables'],
    ['Salteado de verduras con tofu', 'sauteed-vegetables'],
    ['Flan de caramelo', 'dessert'],
    ['Natilla', 'dessert'],
    ['Gelatina de fresa', 'dessert'],
    ['Jugo de mora', 'beverage'],
    ['Limonada de coco', 'beverage'],
    ['Batido de banano', 'beverage'],
  ];

  it.each(cases)('"%s" → %s', (name, expected) => {
    expect(key(name)).toBe(expected);
  });

  it('cubre todas las categorías del catálogo con al menos un ejemplo', () => {
    const covered = new Set(cases.map(([, k]) => k));
    for (const k of RECIPE_IMAGE_KEYS) expect(covered.has(k)).toBe(true);
  });

  it('ignora artículos y adjetivos de relleno al inicio del nombre', () => {
    expect(key('Deliciosa sopa de tomate')).toBe('soup');
    expect(key('La tradicional arepa con queso')).toBe('arepa');
    expect(key('Rápido arroz con huevo')).toBe('rice-dish');
  });
});

describe('resolveRecipeImageKey — títulos ambiguos', () => {
  it('"arroz con leche" es postre y NUNCA un arroz salado', () => {
    expect(key('Arroz con leche')).toBe('dessert');
    expect(key('Arroz con leche y canela')).toBe('dessert');
    expect(key('Delicioso arroz con leche casero')).toBe('dessert');
    expect(key('Arroz con leche')).not.toBe('rice-dish');
  });

  it('un "arroz con leche" con mariscos/proteína salada queda sin imagen', () => {
    expect(key('Arroz con leche de coco y camarones')).toBeNull();
  });

  it('arroz con señales dulces en el nombre o en los ingredientes queda sin imagen', () => {
    expect(key('Arroz dulce')).toBeNull();
    expect(key('Arroz con dulce de coco')).toBeNull();
    expect(key('Arroz de coco', ing('Arroz', 'Leche', 'Azúcar', 'Canela'))).toBeNull();
    // Leche sola (sin endulzantes) no basta para descartar un arroz salado
    expect(key('Arroz cremoso con pollo', ing('Arroz', 'Pollo', 'Leche'))).toBe('rice-dish');
  });

  it('postres de núcleo salado se reconocen como postre', () => {
    expect(key('Sopa borracha')).toBe('dessert');
    expect(key('Crema volteada')).toBe('dessert');
    expect(key('Torta tres leches')).toBe('dessert');
  });

  it('"crema" dulce no recibe imagen de crema de verduras', () => {
    expect(key('Crema de chocolate')).toBeNull();
    expect(key('Crema de maracuyá')).toBeNull();
  });

  it('"ensalada de frutas" no recibe imagen de ensalada de hojas', () => {
    expect(key('Ensalada de frutas')).toBeNull();
    expect(key('Ensalada de frutas con helado')).toBeNull();
  });

  it('núcleos de postre/bebida con proteínas saladas quedan sin imagen', () => {
    expect(key('Mousse de salmón')).toBeNull();
    expect(key('Batido de pollo')).toBeNull();
  });

  it('una palabra de bebida o postre fuera del núcleo no cambia la categoría', () => {
    expect(key('Pollo en jugo de naranja')).toBe('chicken');
    expect(key('Pescado con salsa de mango')).toBe('fish');
  });

  it('"tortilla" solo es huevos si la receta realmente lleva huevo', () => {
    expect(key('Tortilla de papa', ing('Papa', 'Huevo', 'Cebolla'))).toBe('eggs');
    expect(key('Tortilla de huevo')).toBe('eggs');
    expect(key('Tortillas de maíz con frijoles', ing('Harina de maíz', 'Frijoles'))).toBeNull();
    expect(key('Revuelto de verduras', ing('Zanahoria', 'Calabacín'))).toBeNull();
    expect(key('Revuelto de verduras', ing('Huevos', 'Zanahoria'))).toBe('eggs');
  });

  it('"salteado de carne" no se presenta como carne guisada', () => {
    expect(key('Salteado de carne')).toBeNull();
    expect(key('Carne asada')).toBeNull();
    expect(key('Bistec a caballo')).toBeNull();
  });
});

describe('resolveRecipeImageKey — sin coincidencia fiable', () => {
  it.each([
    'Pastel de pollo',
    'Wrap de vegetales',
    'Hamburguesa casera',
    'Cazuela de mariscos',
    'Patacones con hogao',
    'Bowl mediterráneo',
    'Receta 1',
    'Plato especial del chef',
  ])('"%s" → null', (name) => {
    expect(key(name)).toBeNull();
  });

  it('entradas vacías o inválidas devuelven null', () => {
    expect(resolveRecipeImageKey(null)).toBeNull();
    expect(resolveRecipeImageKey(undefined)).toBeNull();
    expect(resolveRecipeImageKey({ name: '' })).toBeNull();
    expect(resolveRecipeImageKey({ name: '   ' })).toBeNull();
    expect(resolveRecipeImageKey({ name: 123 })).toBeNull();
    expect(resolveRecipeImageKey({ name: 'La deliciosa' })).toBeNull();
    expect(resolveRecipeImageKey({ name: 'Sopa', ingredients: [null, undefined, { name: 5 }] })).toBe('soup');
  });
});

describe('resolveRecipeImageKey — determinismo', () => {
  it('la misma entrada produce siempre la misma clave y no muta la entrada', () => {
    const recipe = { name: 'Tortilla de papa', ingredients: ing('Papa', 'Huevo') };
    const snapshot = JSON.stringify(recipe);
    const results = Array.from({ length: 5 }, () => resolveRecipeImageKey(recipe));
    expect(new Set(results)).toEqual(new Set(['eggs']));
    expect(JSON.stringify(recipe)).toBe(snapshot);
  });

  it('no depende de mayúsculas ni tildes', () => {
    expect(key('SOPA DE LENTEJAS')).toBe(key('sopa de lentejas'));
    expect(key('Puré de papa')).toBe(key('pure de papa'));
  });
});
