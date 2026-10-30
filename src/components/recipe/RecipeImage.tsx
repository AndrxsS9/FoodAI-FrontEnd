/**
 * FoodAI - Componente reutilizable y accesible de imagen de receta (Fase 6B.1).
 *
 * Características:
 * 1. Soporta recursos empaquetados locales (require) y URLs remotas HTTPS seguras.
 * 2. Rechaza URLs HTTP inseguras para prevenir riesgos de Cleartext Traffic y MitM.
 * 3. Soporta recetas sin imagen (generadas por IA o sin fotografía asignada).
 * 4. Renderiza un respaldo visual pulido y consistente con el diseño Google Stitch cuando no hay imagen disponible.
 * 5. Maneja fallos de carga remota (onError) sin contenedores vacíos ni íconos rotos.
 * 6. Mantiene proporciones y radios de borde coherentes según los tokens del tema.
 * 7. Compatible con Android, iOS y Expo Web.
 * 8. Etiquetas de accesibilidad descriptivas para lectores de pantalla sin agrupar ni ocultar elementos superpuestos (children).
 * 9. Evita parpadeos y re-renderizados innecesarios.
 */

import React, { useState, useEffect, useMemo, memo } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Text,
  StyleProp,
  ViewStyle,
  ImageStyle,
  ImageSourcePropType,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTypography } from '../../theme/typography';
import { isSecureRemoteImageUrl } from '../../types/recipe';

export { isSecureRemoteImageUrl } from '../../types/recipe';

/**
 * Resuelve y valida de manera determinista la fuente de una imagen de receta.
 * Retorna null si la fuente es inválida, vacía, malformada o insegura (HTTP no seguro).
 */
export function resolveRecipeImageSource(
  source: unknown
): ImageSourcePropType | null {
  if (source === null || source === undefined) {
    return null;
  }

  // Si es un recurso local empaquetado (número en React Native de require(...))
  if (typeof source === 'number') {
    return source;
  }

  // Si es un string URL (se exige HTTPS o loopback seguro de desarrollo)
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (isSecureRemoteImageUrl(trimmed)) {
      return { uri: trimmed };
    }
    return null;
  }

  // Si es un objeto ImageURISource o un asset mock de Jest/bundler ({ testUri: '...' }, { default: ... })
  if (typeof source === 'object') {
    if (
      'testUri' in source &&
      typeof (source as any).testUri === 'string' &&
      (source as any).testUri.trim().length > 0
    ) {
      return source as any;
    }
    if ('default' in source) {
      return resolveRecipeImageSource((source as any).default);
    }
    if ('uri' in source && typeof (source as any).uri === 'string') {
      const uri = (source as any).uri.trim();
      if (isSecureRemoteImageUrl(uri)) {
        return { ...(source as object), uri };
      }
      return null;
    }
    // Soporte para arreglos de fuentes
    if (Array.isArray(source) && source.length > 0) {
      return source as any;
    }
  }

  return null;
}

export interface RecipeImageProps {
  /** Fuente de imagen de la receta (require local, URL string o ImageSourcePropType) */
  source?: ImageSourcePropType | string | null;
  /** Nombre de la receta para accesibilidad y textos de respaldo */
  recipeName: string;
  /** Si la receta corresponde a un dato demostrativo */
  isDemo?: boolean;
  /** Estilo del contenedor exterior */
  containerStyle?: StyleProp<ViewStyle>;
  /** Estilo de la imagen interna */
  imageStyle?: StyleProp<ImageStyle>;
  /** Modo de ajuste (por defecto 'cover') */
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  /** Radio de borde (por defecto radius.lg = 16) */
  borderRadius?: number;
  /** Altura explícita del contenedor */
  height?: number | string;
  /** Ancho explícito del contenedor */
  width?: number | string;
  /** Relación de aspecto del contenedor */
  aspectRatio?: number;
  /** TestID para el contenedor de la imagen */
  testID?: string;
  /** TestID para el contenedor de respaldo (fallback) */
  fallbackTestID?: string;
  /** Etiqueta de accesibilidad personalizada */
  accessibilityLabel?: string;
  /** Componentes hijos superpuestos (badges, degradados, títulos) */
  children?: React.ReactNode;
}

export const RecipeImage = memo(function RecipeImage({
  source,
  recipeName,
  isDemo = false,
  containerStyle,
  imageStyle,
  resizeMode = 'cover',
  borderRadius,
  height,
  width = '100%',
  aspectRatio,
  testID,
  fallbackTestID,
  accessibilityLabel,
  children,
}: RecipeImageProps) {
  const typography = useTypography();
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const resolvedSource = useMemo(() => resolveRecipeImageSource(source), [source]);

  // Si cambia la fuente entrante, reiniciamos el estado de error
  useEffect(() => {
    setLoadError(false);
  }, [source]);

  const shouldShowFallback = !resolvedSource || loadError;

  const containerDimensionStyles = useMemo<ViewStyle>(() => {
    return {
      ...(borderRadius !== undefined ? { borderRadius } : {}),
      ...(height !== undefined ? { height: height as any } : {}),
      ...(width !== undefined ? { width: width as any } : {}),
      ...(aspectRatio !== undefined ? { aspectRatio } : {}),
    };
  }, [borderRadius, height, width, aspectRatio]);

  if (shouldShowFallback) {
    const fallbackLabel =
      accessibilityLabel || `Ilustración de ${recipeName || 'la receta'}`;

    return (
      <View
        style={[styles.container, styles.fallbackContainer, containerDimensionStyles, containerStyle]}
        testID={fallbackTestID || (testID ? `${testID}-fallback` : undefined)}
        accessible={false}
      >
        <View
          style={styles.fallbackVisual}
          accessible={true}
          accessibilityRole="image"
          accessibilityLabel={fallbackLabel}
          testID={testID ? `${testID}-fallback-visual` : 'recipe-fallback-visual'}
        >
          <View
            style={styles.fallbackIconBadge}
            importantForAccessibility="no"
            accessibilityElementsHidden={true}
          >
            <MaterialIcons name="restaurant" size={36} color={colors.primary} />
          </View>

          <Text style={[styles.fallbackTitle, typography.labelSm]}>FoodAI Receta</Text>

          {isDemo && (
            <View style={styles.demoPillBadge}>
              <Text style={[styles.demoPillText, typography.labelSm]}>Ejemplo</Text>
            </View>
          )}
        </View>

        {children}
      </View>
    );
  }

  const imageLabel =
    accessibilityLabel ||
    `Foto del plato${isDemo ? ' de ejemplo' : ''}: ${recipeName || 'Receta'}`;

  return (
    <View
      style={[styles.container, containerDimensionStyles, containerStyle]}
      testID={testID}
      accessible={false}
    >
      <Image
        testID={testID ? `${testID}-img` : 'recipe-native-image'}
        source={resolvedSource}
        style={[styles.image, borderRadius !== undefined && { borderRadius }, imageStyle]}
        resizeMode={resizeMode}
        accessible={true}
        accessibilityRole="image"
        accessibilityLabel={imageLabel}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onError={() => {
          setLoadError(true);
          setIsLoading(false);
        }}
      />

      {isLoading && (
        <View
          style={styles.loadingContainer}
          accessible={false}
          importantForAccessibility="no"
          accessibilityElementsHidden={true}
        >
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainer,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallbackContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLow,
    padding: spacing.md,
    gap: spacing.xs,
  },
  fallbackVisual: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  fallbackIconBadge: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  fallbackTitle: {
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  demoPillBadge: {
    backgroundColor: '#FFDF9B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginTop: 2,
  },
  demoPillText: {
    color: '#503B00',
    fontSize: 10,
    fontWeight: '700',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240, 237, 233, 0.4)',
  },
});
