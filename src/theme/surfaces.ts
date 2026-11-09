/**
 * FoodAI Design System - Superficies compartidas.
 *
 * Único punto donde los tokens de color se convierten en estilos de superficie: lienzo, tarjetas,
 * mosaicos y acciones principales. `backgroundImage` es una mejora progresiva: si una plataforma no
 * pinta el degradado, queda visible el `backgroundColor` sólido del mismo estilo.
 */
import type { ViewStyle } from 'react-native';
import type { AppColors } from './colors';
import { radius } from './radius';

/** Estilo de degradado de un token; los tokens vacíos (tema claro) no añaden nada. */
export const gradientStyle = (gradient: string): ViewStyle =>
  gradient ? { backgroundImage: gradient } : {};

/** Estilo de sombra de un token; los tokens vacíos no añaden nada. */
export const shadowStyle = (shadow: string): ViewStyle => (shadow ? { boxShadow: shadow } : {});

export interface AppSurfaces {
  /** Fondo de pantalla. */
  canvas: ViewStyle;
  /** Tarjeta principal con borde púrpura. */
  card: ViewStyle;
  /** Indicador compacto dentro de una cuadrícula. */
  tile: ViewStyle;
  /** Acción principal habilitada. */
  cta: ViewStyle;
  /** Barra o panel fijo sobre el contenido. */
  dock: ViewStyle;
  /** Mosaico de marca (encabezados y respaldo de imágenes). */
  brand: ViewStyle;
}

export const getAppSurfaces = (colors: AppColors): AppSurfaces => ({
  canvas: { backgroundColor: colors.canvas, ...gradientStyle(colors.gradientCanvas) },
  card: {
    backgroundColor: colors.surface,
    ...gradientStyle(colors.gradientCard),
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.xl,
  },
  tile: {
    backgroundColor: colors.surface,
    ...gradientStyle(colors.gradientTile),
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg + 2,
  },
  cta: { backgroundColor: colors.cta, ...gradientStyle(colors.gradientCta) },
  dock: {
    backgroundColor: colors.dockSurface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...shadowStyle(colors.shadowDock),
  },
  brand: { backgroundColor: colors.brandTile, ...gradientStyle(colors.gradientBrand) },
});
