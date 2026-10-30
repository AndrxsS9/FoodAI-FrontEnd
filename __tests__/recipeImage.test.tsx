/**
 * FoodAI - Pruebas de regresión para el componente RecipeImage y resolución de fuentes (Fase 6B.1).
 *
 * Valida:
 * 1. Resolución determinista de fuentes (resolveRecipeImageSource): locales, URLs seguras, inválidas y nulas.
 * 2. Renderizado de recetas con imagen empaquetada (require local).
 * 3. Renderizado de recetas con URL remota válida (https:// y http://).
 * 4. Respaldo neutral de FoodAI ante recetas sin imagen (undefined o null).
 * 5. Respaldo neutral ante URLs inválidas, vacías o malformadas.
 * 6. Conmutación a fallback en caso de error de red o carga (onError).
 * 7. Identificación y badges para recetas en modo demostración (isDemo).
 * 8. Renderizado correcto de componentes hijos superpuestos (badges, degradados, títulos).
 * 9. Etiquetas de accesibilidad y roles para lectores de pantalla.
 * 10. Dimensiones, radios de borde y relaciones de aspecto personalizadas.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import {
  RecipeImage,
  resolveRecipeImageSource,
} from '../src/components/recipe/RecipeImage';
import { TypographyProvider } from '../src/theme';

async function renderWithTheme(ui: React.ReactElement) {
  return await render(<TypographyProvider usingFallback={true}>{ui}</TypographyProvider>);
}

describe('RecipeImage — Resolución de Fuentes (resolveRecipeImageSource)', () => {
  it('resuelve correctamente recursos locales empaquetados (números de require)', () => {
    const mockRequire = 42;
    expect(resolveRecipeImageSource(mockRequire)).toBe(42);
  });

  it('resuelve URLs remotas HTTPS seguras en formato de string', () => {
    const url = 'https://images.unsplash.com/photo-recipe-123.jpg';
    expect(resolveRecipeImageSource(url)).toEqual({ uri: url });
  });

  it('resuelve URLs remotas HTTP válidas en formato de string', () => {
    const url = 'http://example.com/receta.png';
    expect(resolveRecipeImageSource(url)).toEqual({ uri: url });
  });

  it('recorta espacios en blanco en URLs remotas', () => {
    const urlWithSpaces = '   https://images.foodai.app/pollo.jpg   ';
    expect(resolveRecipeImageSource(urlWithSpaces)).toEqual({
      uri: 'https://images.foodai.app/pollo.jpg',
    });
  });

  it('resuelve objetos con propiedad uri válida', () => {
    const sourceObj = { uri: 'https://cdn.foodai.app/soup.jpg' };
    expect(resolveRecipeImageSource(sourceObj)).toEqual(sourceObj);
  });

  it('soporta objetos transformados por el packager/Jest con testUri', () => {
    const jestAssetObj = { testUri: '../../../assets/images/recipe.jpg' };
    expect(resolveRecipeImageSource(jestAssetObj)).toEqual(jestAssetObj);
  });

  it('resuelve recursivamente objetos envueltos en default export', () => {
    const wrapped = { default: 99 };
    expect(resolveRecipeImageSource(wrapped)).toBe(99);
  });

  it('retorna null para valores nulos o indefinidos', () => {
    expect(resolveRecipeImageSource(null)).toBeNull();
    expect(resolveRecipeImageSource(undefined)).toBeNull();
  });

  it('retorna null para strings vacíos o compuestos únicamente de espacios', () => {
    expect(resolveRecipeImageSource('')).toBeNull();
    expect(resolveRecipeImageSource('   ')).toBeNull();
  });

  it('retorna null para strings sin protocolo http:// o https:// (rutas relativas o inválidas)', () => {
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

describe('RecipeImage — Componente Visual y Accesibilidad', () => {
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

    // Accesibilidad descriptiva por defecto
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

  it('3. Renderiza el respaldo neutral FoodAI ante una receta sin imagen (undefined o null)', async () => {
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

  it('4. Activa el fallback neutral ante URLs vacías o inválidas', async () => {
    const { getByTestId, queryByTestId } = await renderWithTheme(
      <RecipeImage
        source=""
        recipeName="Arepas con Queso"
        testID="recipe-image-container"
        fallbackTestID="recipe-fallback-container"
      />
    );

    expect(getByTestId('recipe-fallback-container')).toBeTruthy();
    expect(queryByTestId('recipe-image-container')).toBeNull();
  });

  it('5. Conmuta suavemente al fallback ante fallo de carga remota (onError) sin romper la UI', async () => {
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

  it('6. Muestra indicación de demo en accesibilidad cuando la imagen existe y badge "Ejemplo" en fallback', async () => {
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

  it('7. Renderiza componentes hijos superpuestos (overlays, badges, títulos) tanto en imagen como en fallback', async () => {
    const screenA = await renderWithTheme(
      <RecipeImage
        source={106}
        recipeName="Postre de Natas"
      >
        <View testID="overlay-badge">
          <Text>95% conveniente</Text>
        </View>
      </RecipeImage>
    );
    expect(screenA.getByText('95% conveniente')).toBeTruthy();

    const screenB = await renderWithTheme(
      <RecipeImage
        source={null}
        recipeName="Brevas con Arequipe"
      >
        <View testID="overlay-badge-fallback">
          <Text>88% conveniente</Text>
        </View>
      </RecipeImage>
    );
    expect(screenB.getByText('88% conveniente')).toBeTruthy();
  });

  it('8. Permite sobrescribir accessibilityLabel y personalizar dimensiones / borderRadius', async () => {
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
