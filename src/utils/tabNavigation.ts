/**
 * FoodAI - Regreso seguro a una pestaña desde una pantalla apilada sobre `(tabs)`.
 *
 * `router.replace` sustituye la pantalla superior por un NUEVO navegador de pestañas, y deja dos
 * instancias de `(tabs)` en el stack raíz, con sus pantallas montadas dos veces. `dismissTo` vuelve
 * a la instancia existente y selecciona la pestaña. Sin historial al que volver (p. ej. al abrir un
 * enlace directo) no hay nada que descartar, y `replace` es lo correcto.
 */
type TabReturnRouter = {
  replace: (href: any) => void;
  canDismiss?: () => boolean;
  dismissTo?: (href: any) => void;
};

export function returnToTab(router: TabReturnRouter, href: string): void {
  if (router.canDismiss?.() && router.dismissTo) {
    router.dismissTo(href);
    return;
  }
  router.replace(href);
}
