/**
 * FoodAI - Pruebas de regresión para el componente RecipeImage y resolución de fuentes (Fase 6B.1).
 *
 * Valida:
 * 1. Resolución determinista de fuentes (resolveRecipeImageSource): locales, URLs seguras, inválidas y nulas.
 * 2. Política de seguridad HTTPS estricta: aceptación de HTTPS con host válido, rechazo de HTTP inseguro y loopback en dev.
 * 3. Validación estricta de arreglos de fuentes (ImageURISource[]):
 *    - Aceptación de arreglos con fuentes HTTPS o assets válidos.
 *    - Rechazo de arreglos vacíos ([]).
 *    - Rechazo de arreglos que contengan al menos una fuente HTTP insegura o malformada.
 *    - Rechazo de arreglos anidados.
 * 4. Renderizado de recetas con imagen empaquetada (require local) y recetas demo de fixture.
 * 5. Renderizado de recetas con URL remota válida (https://) y arreglos multi-resolución.
 * 6. Respaldo neutral de FoodAI ante recetas sin imagen (undefined o null).
 * 7. Respaldo neutral ante URLs HTTP inseguras, vacías, malformadas o arreglos inválidos.
 * 8. Conmutación a fallback en caso de error de red o carga (onError).
 * 9. Identificación y badges para recetas en modo demostración (isDemo).
 * 10. Accesibilidad avanzada de overlays:
 *    - La imagen / fallback conserva su etiqueta descriptiva e independencia.
 *    - El contenedor exterior no colapsa ni oculta elementos superpuestos (children).
 *    - Los títulos superpuestos retienen accessibilityRole="header".
 *    - Las métricas de conveniencia y comensales son legibles individualmente.
 *    - Los degradados y elementos puramente decorativos no producen lecturas vacías.
 * 11. Dimensiones, radios de borde y relaciones de aspecto personalizadas.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import {
  RecipeImage,
  resolveRecipeImageSource,
  isSecureRemoteImageUrl,
} from '../src/components/recipe/RecipeImage';
import { TypographyProvider } from '../src/theme';
import { BASE_DEMO_RECIPES } from '../src/fixtures/demoRecipes';

async function renderWithTheme(ui: React.ReactElement) {
  return await render(<TypographyProvider usingFallback={true}>{ui}</TypographyProvider>);
}

describe('RecipeImage — Validación de Seguridad de URLs Remotas (isSecureRemoteImageUrl)', () => {
  it('acepta URLs remotas HTTPS seguras', () => {
    expect(isSecureRemoteImageUrl('https://images.unsplash.com/photo-123.jpg')).toBe(true);
    expect(isSecureRemoteImageUrl('https://cdn.foodai.app/recipes/pollo.png')).toBe(true);
    expect(isSecureRemoteImageUrl('https://foodai.co/a/b?c=1#d')).toBe(true);
  });

  it('rechaza URLs remotas HTTP inseguras en producción', () => {
    expect(isSecureRemoteImageUrl('http://insecure-cdn.com/recipe.jpg')).toBe(false);
    expect(isSecureRemoteImageUrl('http://example.com/receta.png')).toBe(false);
  });

  it('permite loopback local en entorno de desarrollo (__DEV__)', () => {
    expect(isSecureRemoteImageUrl('http://localhost:8081/assets/demo.jpg')).toBe(true);
    expect(isSecureRemoteImageUrl('http://127.0.0.1:8081/assets/demo.jpg')).toBe(true);
    expect(isSecureRemoteImageUrl('http://10.0.2.2:8081/assets/demo.jpg')).toBe(true);
  });

  it('rechaza dominios .local arbitrarios en desarrollo (no son loopback)', () => {
    expect(isSecureRemoteImageUrl('http://mycomputer.local/asset.jpg')).toBe(false);
    expect(isSecureRemoteImageUrl('http://server.local:8080/dish.png')).toBe(false);
  });

  it('rechaza URLs HTTPS malformadas sin hostname válido o con caracteres ilegales', () => {
    expect(isSecureRemoteImageUrl('https://')).toBe(false);
    expect(isSecureRemoteImageUrl('https:// ')).toBe(false);
    expect(isSecureRemoteImageUrl('https:///path')).toBe(false);
    expect(isSecureRemoteImageUrl('https://?query')).toBe(false);
    expect(isSecureRemoteImageUrl('https://#hash')).toBe(false);
    expect(isSecureRemoteImageUrl('https://:8080')).toBe(false);
    expect(isSecureRemoteImageUrl('https://nodot')).toBe(false);
    expect(isSecureRemoteImageUrl('https://invalid host.com/pic.jpg')).toBe(false);
    expect(isSecureRemoteImageUrl('https://foo..bar.com')).toBe(false);
  });

  it('rechaza protocolos no soportados o entradas no string', () => {
    expect(isSecureRemoteImageUrl('ftp://server/food.png')).toBe(false);
    expect(isSecureRemoteImageUrl('file:///storage/photo.jpg')).toBe(false);
    expect(isSecureRemoteImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSecureRemoteImageUrl('')).toBe(false);
    expect(isSecureRemoteImageUrl('   ')).toBe(false);
    expect(isSecureRemoteImageUrl(null)).toBe(false);
    expect(isSecureRemoteImageUrl(undefined)).toBe(false);
    expect(isSecureRemoteImageUrl(12345)).toBe(false);
    expect(isSecureRemoteImageUrl({})).toBe(false);
  });
});

describe('RecipeImage — Resolución de Fuentes (resolveRecipeImageSource)', () => {
  it('resuelve correctamente recursos locales empaquetados (números de require)', () => {
    const mockRequire = 42;
    expect(resolveRecipeImageSource(mockRequire)).toBe(42);
  });

  it('resuelve el asset empaquetado de la receta de demostración (BASE_DEMO_RECIPES[0])', () => {
    const demoImage = BASE_DEMO_RECIPES[0].imageUrl;
    expect(resolveRecipeImageSource(demoImage)).toBeTruthy();
  });

  it('resuelve URLs remotas HTTPS seguras en formato de string', () => {
    const url = 'https://images.unsplash.com/photo-recipe-123.jpg';
    expect(resolveRecipeImageSource(url)).toEqual({ uri: url });
  });

  it('rechaza URLs remotas HTTP inseguras retornando null para activar fallback seguro', () => {
    const insecureUrl = 'http://example.com/receta.png';
    expect(resolveRecipeImageSource(insecureUrl)).toBeNull();
  });

  it('recorta espacios en blanco en URLs remotas HTTPS', () => {
    const urlWithSpaces = '   https://images.foodai.app/pollo.jpg   ';
    expect(resolveRecipeImageSource(urlWithSpaces)).toEqual({
      uri: 'https://images.foodai.app/pollo.jpg',
    });
  });

  it('resuelve objetos con propiedad uri HTTPS válida', () => {
    const sourceObj = { uri: 'https://cdn.foodai.app/soup.jpg' };
    expect(resolveRecipeImageSource(sourceObj)).toEqual(sourceObj);
  });

  it('rechaza objetos con propiedad uri HTTP insegura', () => {
    const insecureObj = { uri: 'http://cdn.foodai.app/soup.jpg' };
    expect(resolveRecipeImageSource(insecureObj)).toBeNull();
  });

  it('soporta objetos transformados por el packager/Jest con testUri', () => {
    const jestAssetObj = { testUri: '../../../assets/images/recipe.jpg' };
    expect(resolveRecipeImageSource(jestAssetObj)).toEqual(jestAssetObj);
  });

  it('resuelve recursivamente objetos envueltos en default export', () => {
    const wrapped = { default: 99 };
    expect(resolveRecipeImageSource(wrapped)).toBe(99);
  });

  describe('Validación de arreglos de fuentes (ImageURISource[])', () => {
    it('acepta arreglos con fuentes HTTPS válidas y preserva metadatos legítimos', () => {
      const validArray = [
        { uri: 'https://cdn.foodai.app/dish-300.jpg', width: 300, height: 200 },
        { uri: 'https://cdn.foodai.app/dish-600.jpg', width: 600, height: 400 },
      ];
      expect(resolveRecipeImageSource(validArray)).toEqual(validArray);
    });

    it('acepta arreglos con recursos empaquetados locales válidos', () => {
      const localArray = [42, 43];
      expect(resolveRecipeImageSource(localArray)).toEqual(localArray);
    });

    it('acepta arreglos de strings con URLs HTTPS válidas', () => {
      const stringArray = ['https://cdn.foodai.app/img1.jpg'];
      expect(resolveRecipeImageSource(stringArray)).toEqual([
        { uri: 'https://cdn.foodai.app/img1.jpg' },
      ]);
    });

    it('rechaza arreglos vacíos retornando null', () => {
      expect(resolveRecipeImageSource([])).toBeNull();
    });

    it('rechaza arreglos que contengan al menos una fuente HTTP insegura', () => {
      const mixedArray = [
        { uri: 'https://cdn.foodai.app/safe.jpg' },
        { uri: 'http://insecure.com/bad.jpg' },
      ];
      expect(resolveRecipeImageSource(mixedArray)).toBeNull();
    });

    it('rechaza arreglos que contengan objetos vacíos o malformados', () => {
      expect(resolveRecipeImageSource([{ uri: '' }])).toBeNull();
      expect(resolveRecipeImageSource([{}])).toBeNull();
      expect(resolveRecipeImageSource([null])).toBeNull();
      expect(resolveRecipeImageSource([undefined])).toBeNull();
    });

    it('rechaza arreglos anidados (matrices no permitidas)', () => {
      expect(resolveRecipeImageSource([[42]])).toBeNull();
    });
  });

  it('retorna null para valores nulos o indefinidos', () => {
    expect(resolveRecipeImageSource(null)).toBeNull();
    expect(resolveRecipeImageSource(undefined)).toBeNull();
  });

  it('retorna null para strings vacíos o compuestos únicamente de espacios', () => {
    expect(resolveRecipeImageSource('')).toBeNull();
    expect(resolveRecipeImageSource('   ')).toBeNull();
  });

  it('retorna null para strings sin protocolo HTTPS (rutas relativas o inválidas)', () => {
    expect(resolveRecipeImageSource('recipe.jpg')).toBeNull();
    expect(resolveRecipeImageSource('/images/soup.png')).toBeNull();
    expect(resolveRecipeImageSource('ftp://server/food.png')).toBeNull();
  });

  it('retorna null para objetos con uri vacía o no soportada', () => {
    expect(resolveRecipeImageSource({ uri: '' } as any)).toBeNull();
    expect(resolveRecipeImageSource({ uri: 'ftp://bad.com' } as any)).toBeNull();
    expect(resolveRecipeImageSource({} as any)).toBeNull();
  });
});

describe('RecipeImage — Componente Visual y Accesibilidad de Overlays', () => {
  it('1. Renderiza correctamente una receta con imagen empaquetada (require local) y accesibilidad', async () => {
    const mockRequire = 101;
    const { getByTestId, queryByTestId, getByLabelText } = await renderWithTheme(
      <RecipeImage
        source={mockRequire}
        recipeName="Ajiaco Santafereño"
        testID="recipe-image-container"
        fallbackTestID="recipe-fallback-container"
      />
    );

    // Debe existir el contenedor de imagen y NO el de fallback
    expect(getByTestId('recipe-image-container')).toBeTruthy();
    expect(queryByTestId('recipe-fallback-container')).toBeNull();

    // Accesibilidad descriptiva en la imagen
    expect(getByLabelText('Foto del plato: Ajiaco Santafereño')).toBeTruthy();
  });

  it('2. Acepta y renderiza una receta con URL remota HTTPS válida', async () => {
    const remoteUrl = 'https://images.foodai.app/sancocho.jpg';
    const { getByTestId, queryByTestId, getByLabelText } = await renderWithTheme(
      <RecipeImage
        source={remoteUrl}
        recipeName="Sancocho de Gallina"
        testID="recipe-image-container"
        fallbackTestID="recipe-fallback-container"
      />
    );

    expect(getByTestId('recipe-image-container')).toBeTruthy();
    expect(queryByTestId('recipe-fallback-container')).toBeNull();
    expect(getByLabelText('Foto del plato: Sancocho de Gallina')).toBeTruthy();
  });

  it('3. Acepta y renderiza un arreglo de fuentes HTTPS multi-resolución', async () => {
    const sources = [
      { uri: 'https://images.foodai.app/sancocho-sm.jpg', width: 300 },
      { uri: 'https://images.foodai.app/sancocho-lg.jpg', width: 600 },
    ];
    const { getByTestId, queryByTestId, getByLabelText } = await renderWithTheme(
      <RecipeImage
        source={sources}
        recipeName="Sancocho Trifásico"
        testID="recipe-image-container"
        fallbackTestID="recipe-fallback-container"
      />
    );

    expect(getByTestId('recipe-image-container')).toBeTruthy();
    expect(queryByTestId('recipe-fallback-container')).toBeNull();
    expect(getByLabelText('Foto del plato: Sancocho Trifásico')).toBeTruthy();
  });

  it('4. Renderiza el respaldo neutral FoodAI ante una receta sin imagen (undefined o null)', async () => {
    const { getByTestId, queryByTestId, getByText, getByLabelText } = await renderWithTheme(
      <RecipeImage
        source={null}
        recipeName="Bandeja Paisa"
        testID="recipe-image-container"
        fallbackTestID="recipe-fallback-container"
      />
    );

    // Debe mostrarse el fallback y NO el contenedor de imagen directa
    expect(getByTestId('recipe-fallback-container')).toBeTruthy();
    expect(queryByTestId('recipe-image-container')).toBeNull();

    // Debe contener el título neutral del respaldo
    expect(getByText('FoodAI Receta')).toBeTruthy();

    // La accesibilidad debe indicar que es una ilustración del plato
    expect(getByLabelText('Ilustración de Bandeja Paisa')).toBeTruthy();
  });

  it('5. Activa el fallback neutral ante URLs HTTP inseguras, vacías o arreglos con fuentes inseguras', async () => {
    // Caso A: String HTTP inseguro
    const screenA = await renderWithTheme(
      <RecipeImage
        source="http://insecure-domain.com/dish.png"
        recipeName="Arepas con Queso"
        fallbackTestID="fallback-insecure-string"
      />
    );
    expect(screenA.getByTestId('fallback-insecure-string')).toBeTruthy();

    // Caso B: Arreglo mixto con HTTP inseguro
    const screenB = await renderWithTheme(
      <RecipeImage
        source={[
          { uri: 'https://valid.com/1.jpg' },
          { uri: 'http://insecure.com/2.jpg' },
        ]}
        recipeName="Arepas con Huevo"
        fallbackTestID="fallback-mixed-array"
      />
    );
    expect(screenB.getByTestId('fallback-mixed-array')).toBeTruthy();

    // Caso C: Arreglo vacío
    const screenC = await renderWithTheme(
      <RecipeImage
        source={[]}
        recipeName="Arepas de Choclo"
        fallbackTestID="fallback-empty-array"
      />
    );
    expect(screenC.getByTestId('fallback-empty-array')).toBeTruthy();
  });

  it('6. Conmuta suavemente al fallback ante fallo de carga remota (onError) sin romper la UI', async () => {
    const failingUrl = 'https://images.foodai.app/broken-image.jpg';
    const { getByTestId, queryByTestId, getByText } = await renderWithTheme(
      <RecipeImage
        source={failingUrl}
        recipeName="Cazuela de Mariscos"
        testID="recipe-image-container"
        fallbackTestID="recipe-fallback-container"
      />
    );

    // Inicialmente intenta renderizar la imagen
    expect(getByTestId('recipe-image-container')).toBeTruthy();
    expect(getByTestId('recipe-image-container-img')).toBeTruthy();

    // Se dispara el evento de error de la imagen nativa dentro de act
    await act(async () => {
      fireEvent(getByTestId('recipe-image-container-img'), 'error', {
        nativeEvent: { error: 'Network request failed' },
      });
    });

    // Ahora debe haberse conmutado limpiamente al fallback
    expect(getByTestId('recipe-fallback-container')).toBeTruthy();
    expect(queryByTestId('recipe-image-container')).toBeNull();
    expect(getByText('FoodAI Receta')).toBeTruthy();
  });

  it('7. Muestra indicación de demo en accesibilidad cuando la imagen existe y badge "Ejemplo" en fallback', async () => {
    // Caso A: Demo con imagen
    const screenA = await renderWithTheme(
      <RecipeImage
        source={105}
        recipeName="Empanadas Vallunas"
        isDemo={true}
        testID="demo-recipe-image"
      />
    );
    expect(screenA.getByLabelText('Foto del plato de ejemplo: Empanadas Vallunas')).toBeTruthy();

    // Caso B: Demo sin imagen (muestra badge visual de Ejemplo)
    const screenB = await renderWithTheme(
      <RecipeImage
        source={null}
        recipeName="Tamal Tolimense"
        isDemo={true}
        fallbackTestID="demo-recipe-fallback"
      />
    );
    expect(screenB.getByTestId('demo-recipe-fallback')).toBeTruthy();
    expect(screenB.getByText('Ejemplo')).toBeTruthy();
  });

  it('8. Preserva la accesibilidad individual de títulos con accessibilityRole="header" y badges superpuestos', async () => {
    const { getByRole, getByLabelText, getByText } = await renderWithTheme(
      <RecipeImage
        source={106}
        recipeName="Postre de Natas"
        testID="recipe-with-overlay"
      >
        {/* Degradado decorativo: no debe producir anuncios espurios */}
        <View
          testID="decorative-gradient"
          accessible={false}
          importantForAccessibility="no"
          accessibilityElementsHidden={true}
        />
        {/* Título semántico de encabezado */}
        <Text accessibilityRole="header" testID="overlay-title">
          Postre de Natas Casero
        </Text>
        {/* Badge de afinidad con etiqueta propia */}
        <View
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel="Afinidad estimada: 95% conveniente"
        >
          <Text>95% conveniente</Text>
        </View>
      </RecipeImage>
    );

    // 1. La imagen nativa es accesible con su descripción propia
    expect(getByLabelText('Foto del plato: Postre de Natas')).toBeTruthy();

    // 2. El título superpuesto no fue colapsado por el padre y retiene rol de encabezado
    const header = getByRole('header');
    expect(header).toBeTruthy();
    expect(getByText('Postre de Natas Casero')).toBeTruthy();

    // 3. El badge de métrica conserva su accesibilidad individual
    expect(getByLabelText('Afinidad estimada: 95% conveniente')).toBeTruthy();
  });

  it('9. Preserva la accesibilidad de overlays y títulos cuando se muestra el fallback', async () => {
    const { getByRole, getByLabelText, getByText } = await renderWithTheme(
      <RecipeImage
        source={null}
        recipeName="Brevas con Arequipe"
        fallbackTestID="fallback-with-overlay"
      >
        <Text accessibilityRole="header" testID="fallback-overlay-title">
          Brevas con Arequipe de la Abuela
        </Text>
        <View
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel="Afinidad estimada: 88% conveniente"
        >
          <Text>88% conveniente</Text>
        </View>
      </RecipeImage>
    );

    // 1. La ilustración de respaldo es accesible
    expect(getByLabelText('Ilustración de Brevas con Arequipe')).toBeTruthy();

    // 2. El título superpuesto conserva su rol de header
    expect(getByRole('header')).toBeTruthy();
    expect(getByText('Brevas con Arequipe de la Abuela')).toBeTruthy();

    // 3. El badge de conveniencia es navegable independientemente
    expect(getByLabelText('Afinidad estimada: 88% conveniente')).toBeTruthy();
  });

  it('10. Permite sobrescribir accessibilityLabel y personalizar dimensiones / borderRadius', async () => {
    const customLabel = 'Fotografía artística de Lechona Tolimense recién horneada';
    const { getByLabelText, getByTestId } = await renderWithTheme(
      <RecipeImage
        source={107}
        recipeName="Lechona"
        accessibilityLabel={customLabel}
        borderRadius={20}
        height={250}
        aspectRatio={16 / 9}
        testID="custom-styled-image"
      />
    );

    expect(getByLabelText(customLabel)).toBeTruthy();
    const container = getByTestId('custom-styled-image');
    expect(container.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          borderRadius: 20,
          height: 250,
          aspectRatio: 16 / 9,
        }),
      ])
    );
  });
});
