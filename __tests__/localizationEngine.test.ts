/**
 * Fase 28C-A — Motor de localización: catálogos, paridad, interpolación, pluralización,
 * formateadores, etiquetas de valores canónicos y traducción de mensajes de dominio.
 */
import es from '../src/locales/es';
import en from '../src/locales/en';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  compareCatalogs,
  extractPlaceholders,
  flattenCatalog,
  getTranslator,
  hasMessage,
  interpolate,
  selectPluralForm,
  translate,
  translatePlural,
} from '../src/locales';
import {
  MONTH_NAMES_BY_LOCALE,
  MONTH_SHORT_NAMES_BY_LOCALE,
  WEEKDAY_INITIALS_BY_LOCALE,
  WEEKDAY_NAMES_BY_LOCALE,
  describeRelativeExpirationForLocale,
  formatCopForLocale,
  formatNumberForLocale,
  getFormatters,
} from '../src/locales/format';
import {
  formatIngredientQuantityForLocale,
  getCategoryLabel,
  getUnitName,
  getUnitShortLabel,
  localizeRecipeImageLabel,
  localizeUnitText,
} from '../src/locales/labels';
import {
  localizeCanonicalParam,
  localizeCodedError,
  localizeMessage,
  matchDomainMessage,
} from '../src/locales/messages';
import { formatSemanticWarning, formatUnitNameList, getExpirationStatusLabel } from '../src/locales/domainText';
import {
  INGREDIENT_CATEGORIES,
  INGREDIENT_UNITS,
  INGREDIENT_UNIT_LABELS,
  INGREDIENT_UNIT_NAMES,
  getExpirationStatus,
} from '../src/types/pantry';
import { RECIPE_IMAGE_CATEGORY_LABELS, RECIPE_IMAGE_KEYS } from '../src/types/recipeImage';
import { formatCopCurrency, formatIngredientQuantity } from '../src/types/recipe';
import {
  QUANTITY_ERROR_MESSAGES,
  detectIngredientSemanticWarnings,
  validateIngredientForm,
} from '../src/utils/pantryValidation';
import { AUTH_ERROR_MESSAGES } from '../src/services/api/authHeaders';
import { MEAL_PLAN_PERSISTENCE_WARNING_MESSAGES } from '../src/context/MealPlanContext';
import { RECIPE_PERSISTENCE_WARNING_MESSAGES } from '../src/context/RecipeContext';
import {
  DEMO_RECIPE_CONSUMPTION_ERROR,
  INVALID_RECIPE_CONSUMPTION_ERROR,
} from '../src/utils/pantryConsumption';
import { UNIT_CHANGE_QUANTITY_ERROR } from '../src/components/pantry/IngredientFormModal';
import { describeRelativeExpiration, formatLongDate, formatShortDate } from '../src/utils/dateFormat';
import { validateBudgetInput, validateMaxMinutesInput, validateServingsInput } from '../src/types/recipe';
import { mapSupabaseAuthError } from '../src/types/auth';

const SPANISH_MARKERS = /[áéíóúñ¿¡]|\b(el|la|los|las|de|del|tu|tus|para|con|una|un|por|que|despensa|receta|recetas)\b/i;

describe('Fase 28C-A · Catálogos y paridad', () => {
  it('el español es el idioma predeterminado y solo se soportan es/en', () => {
    expect(DEFAULT_LOCALE).toBe('es');
    expect([...SUPPORTED_LOCALES]).toEqual(['es', 'en']);
  });

  it('el catálogo inglés tiene exactamente las mismas claves y marcadores que el español', () => {
    const report = compareCatalogs(es, en);
    expect(report.missingKeys).toEqual([]);
    expect(report.extraKeys).toEqual([]);
    expect(report.placeholderMismatches).toEqual([]);
    expect(report.emptyValues).toEqual([]);
  });

  it('ningún valor del catálogo español está vacío', () => {
    const empty = flattenCatalog(es).filter((e) => !e.value.trim());
    expect(empty).toEqual([]);
  });

  it('las formas plurales existen en ambos idiomas con las mismas claves', () => {
    const pluralKeys = (catalog: unknown) =>
      flattenCatalog(catalog)
        .filter((e) => /\.(one|other)$/.test(e.key))
        .map((e) => e.key)
        .sort();
    expect(pluralKeys(en)).toEqual(pluralKeys(es));
    expect(pluralKeys(es).length).toBeGreaterThan(10);
  });

  it('el catálogo inglés no reutiliza textos en español (salvo nombres propios y símbolos)', () => {
    const allowedIdentical = new Set([
      'common.appName',
      'language.optionEs',
      'language.optionEn',
      'tabs.plan',
      'minutesShort',
      'settings.optionState',
      'filterMax30',
    ]);
    const esMap = new Map(flattenCatalog(es).map((e) => [e.key, e.value]));
    const suspicious = flattenCatalog(en).filter((e) => {
      const original = esMap.get(e.key);
      if (!original || original !== e.value) return false;
      if (allowedIdentical.has(e.key) || [...allowedIdentical].some((k) => e.key.endsWith(k))) return false;
      // Unidades, símbolos y textos sin letras propias del español son idénticos a propósito.
      return SPANISH_MARKERS.test(e.value);
    });
    expect(suspicious.map((e) => e.key)).toEqual([]);
  });

  it('las tablas de fechas tienen la misma longitud en ambos idiomas', () => {
    for (const table of [
      MONTH_NAMES_BY_LOCALE,
      MONTH_SHORT_NAMES_BY_LOCALE,
      WEEKDAY_INITIALS_BY_LOCALE,
      WEEKDAY_NAMES_BY_LOCALE,
    ]) {
      expect(table.en.length).toBe(table.es.length);
    }
  });
});

describe('Fase 28C-A · Traducción, interpolación y pluralización', () => {
  it('traduce claves en ambos idiomas', () => {
    expect(translate('es', 'tabs.home')).toBe('Inicio');
    expect(translate('en', 'tabs.home')).toBe('Home');
    expect(getTranslator('en').t('language.title')).toBe('Language');
  });

  it('interpola parámetros de forma segura en una sola pasada', () => {
    expect(translate('es', 'cooking.stepCounter', { current: 2, total: 5 })).toBe('Paso 2 de 5');
    expect(translate('en', 'cooking.stepCounter', { current: 2, total: 5 })).toBe('Step 2 of 5');
    // Un valor con llaves no se vuelve a interpretar como plantilla
    expect(interpolate('Hola {name}', { name: '{total}', total: 'X' })).toBe('Hola {total}');
    // Un marcador sin valor se conserva visible (no se oculta el error de datos)
    expect(interpolate('Paso {current} de {total}', { current: 1 })).toBe('Paso 1 de {total}');
    // Números no finitos nunca se muestran como NaN/Infinity
    expect(interpolate('{n}', { n: Number.NaN })).toBe('');
  });

  it('extrae marcadores sin duplicados', () => {
    expect(extractPlaceholders('{a} y {b} y {a}')).toEqual(['a', 'b']);
  });

  it('pluraliza con la regla de cada idioma e inyecta {count}', () => {
    expect(selectPluralForm('es', 1)).toBe('one');
    expect(selectPluralForm('es', 0)).toBe('other');
    expect(selectPluralForm('en', 2)).toBe('other');
    expect(translatePlural('es', 'people', 1)).toBe('1 persona');
    expect(translatePlural('es', 'people', 3)).toBe('3 personas');
    expect(translatePlural('en', 'people', 1)).toBe('1 person');
    expect(translatePlural('en', 'people', 4)).toBe('4 people');
    expect(translatePlural('en', 'recipes.aiCountBadge', 2)).toBe('2 recipes generated with AI');
    expect(translatePlural('es', 'recipes.aiCountBadge', 1)).toBe('1 receta generada con IA');
  });

  it('una clave inexistente cae al español y luego a la propia clave', () => {
    expect(hasMessage('en', 'tabs.home')).toBe(true);
    expect(hasMessage('en', 'tabs.inexistente')).toBe(false);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(translate('en', 'tabs.inexistente' as never)).toBe('tabs.inexistente');
    warn.mockRestore();
  });

  it('las claves y parámetros están verificados en compilación', () => {
    const { t, tp } = getTranslator('es');
    // @ts-expect-error clave inexistente
    t('tabs.noExiste');
    // @ts-expect-error faltan los parámetros requeridos por la plantilla
    t('cooking.stepCounter');
    // @ts-expect-error parámetro con nombre incorrecto
    t('cooking.stepCounter', { paso: 1, total: 2 });
    // @ts-expect-error una clave plural no se usa con t()
    t('people');
    // @ts-expect-error una clave simple no se usa con tp()
    tp('tabs.home', 2);
    expect(t('cooking.stepCounter', { current: 1, total: 2 })).toBe('Paso 1 de 2');
  });
});

describe('Fase 28C-A · Fechas, números y moneda (COP)', () => {
  it('mantiene idénticas las salidas en español', () => {
    expect(formatShortDate('2026-11-15')).toBe('15 nov 2026');
    expect(formatShortDate('2026-11-15', 'es')).toBe('15 nov 2026');
    expect(formatLongDate(new Date(2026, 0, 3))).toBe('3 de enero de 2026');
    const ref = new Date(2026, 10, 7);
    expect(describeRelativeExpiration('2026-11-07', ref)).toBe('Vence hoy');
    expect(describeRelativeExpiration('2026-11-05', ref)).toBe('Venció hace 2 días');
  });

  it('formatea fechas en inglés', () => {
    expect(formatShortDate('2026-11-15', 'en')).toBe('Nov 15, 2026');
    expect(formatLongDate(new Date(2026, 0, 3), 'en')).toBe('January 3, 2026');
    const ref = new Date(2026, 10, 7);
    expect(describeRelativeExpiration('2026-11-07', ref, 'en')).toBe('Expires today');
    expect(describeRelativeExpiration('2026-11-08', ref, 'en')).toBe('Expires tomorrow');
    expect(describeRelativeExpiration('2026-11-06', ref, 'en')).toBe('Expired yesterday');
    expect(describeRelativeExpirationForLocale(new Date(2026, 10, 4), 'en', ref)).toBe('Expired 3 days ago');
    expect(describeRelativeExpiration('2026-11-17', ref, 'en')).toBe('Expires in 10 days');
    expect(getFormatters('en').monthYear(10, 2026)).toBe('November 2026');
    expect(getFormatters('es').monthYear(10, 2026)).toBe('Noviembre 2026');
  });

  it('la moneda siempre es COP; el idioma solo cambia el separador de miles', () => {
    for (const amount of [0, 950, 20000, 1234567, -5000, 12500.6]) {
      expect(formatCopForLocale(amount, 'es')).toBe(formatCopCurrency(amount));
      expect(formatCopForLocale(amount, 'es', false)).toBe(formatCopCurrency(amount, false));
    }
    expect(formatCopForLocale(20000, 'en')).toBe('$20,000 COP');
    expect(formatCopForLocale(-5000, 'en', false)).toBe('-$5,000');
    expect(formatCopForLocale(Number.NaN, 'en')).toBe('$0 COP');
    expect(formatNumberForLocale(1234.5, 'es')).toBe('1.234,5');
    expect(formatNumberForLocale(1234.5, 'en')).toBe('1,234.5');
  });
});

describe('Fase 28C-A · Etiquetas de valores canónicos (solo presentación)', () => {
  it('traduce las seis categorías sin alterar el valor canónico', () => {
    const snapshot = [...INGREDIENT_CATEGORIES];
    expect(INGREDIENT_CATEGORIES.map((c) => getCategoryLabel(c, 'es'))).toEqual(snapshot);
    expect(INGREDIENT_CATEGORIES.map((c) => getCategoryLabel(c, 'en'))).toEqual([
      'Fruits & vegetables',
      'Meat & protein',
      'Dairy',
      'Grains & cereals',
      'Pantry staples',
      'Other',
    ]);
    expect([...INGREDIENT_CATEGORIES]).toEqual(snapshot);
    // Valores no canónicos (datos antiguos o del usuario) se muestran tal cual
    expect(getCategoryLabel('Snacks caseros', 'en')).toBe('Snacks caseros');
  });

  it('traduce unidades; en español coincide con las etiquetas existentes', () => {
    for (const unit of INGREDIENT_UNITS) {
      expect(getUnitShortLabel(unit, 'es')).toBe(INGREDIENT_UNIT_LABELS[unit]);
      expect(getUnitName(unit, 'es')).toBe(INGREDIENT_UNIT_NAMES[unit]);
      expect(getUnitShortLabel(unit, 'en')).toBeTruthy();
    }
    expect(getUnitShortLabel('cucharada', 'en')).toBe('tbsp');
    expect(getUnitName('l', 'en')).toBe('Liters (l)');
    expect(localizeUnitText('cda', 'en')).toBe('tbsp');
    expect(localizeUnitText('unidad', 'en')).toBe('pc');
    expect(localizeUnitText('lata', 'en')).toBe('lata');
    expect([...INGREDIENT_UNITS]).toEqual([
      'unidad', 'g', 'kg', 'ml', 'l', 'cucharada', 'cucharadita', 'taza', 'desconocida',
    ]);
  });

  it('formatea cantidades de recetas; el español es idéntico al formateador previo', () => {
    const cases: [number | null, string | undefined][] = [
      [2, 'unidad'], [1.5, 'kg'], [null, 'g'], [null, 'desconocida'], [0, 'g'], [3, undefined],
    ];
    for (const [q, u] of cases) {
      expect(formatIngredientQuantityForLocale(q, u, 'es')).toBe(formatIngredientQuantity(q, u));
    }
    expect(formatIngredientQuantityForLocale(2, 'unidad', 'en')).toBe('2 pc');
    expect(formatIngredientQuantityForLocale(1.5, 'kg', 'en')).toBe('1.5 kg');
    expect(formatIngredientQuantityForLocale(null, 'g', 'en')).toBe('To be confirmed (g)');
    expect(formatIngredientQuantityForLocale(null, 'desconocida', 'en')).toBe('To be confirmed / To taste');
    expect(formatIngredientQuantityForLocale(0, 'g', 'en')).toBe('To taste');
  });

  it('traduce las categorías de imágenes de referencia', () => {
    for (const key of RECIPE_IMAGE_KEYS) {
      const label = RECIPE_IMAGE_CATEGORY_LABELS[key];
      expect(localizeRecipeImageLabel(label, 'es')).toBe(label);
      expect(translate('es', `recipeImage.categories.${key}` as never)).toBe(label);
    }
    expect(localizeRecipeImageLabel('Sopa', 'en')).toBe('Soup');
  });

  it('las etiquetas de vencimiento en inglés derivan de los días restantes', () => {
    const ref = new Date(2026, 10, 7);
    const status = (iso?: string) => getExpirationStatus(iso, ref);
    expect(getExpirationStatusLabel(status('2026-11-07'), 'es')).toBe('Vence hoy');
    expect(getExpirationStatusLabel(status('2026-11-07'), 'en')).toBe('Expires today');
    expect(getExpirationStatusLabel(status('2026-11-08'), 'en')).toBe('Expires tomorrow');
    expect(getExpirationStatusLabel(status('2026-11-09'), 'en')).toBe('Expires in 2 days');
    expect(getExpirationStatusLabel(status('2026-11-12'), 'en')).toBe('Use soon (5d)');
    expect(getExpirationStatusLabel(status('2026-11-04'), 'en')).toBe('Expired (3d)');
    expect(getExpirationStatusLabel(status(undefined), 'en')).toBe('Available');
    expect(getExpirationStatusLabel(status('2026-12-30'), 'en')).toBe('Available');
  });
});

describe('Fase 28C-A · Mensajes de dominio y errores por código', () => {
  it('el español conserva exactamente el mensaje original', () => {
    expect(localizeMessage('Cualquier texto previo', 'es')).toBe('Cualquier texto previo');
    expect(localizeMessage(null, 'en')).toBeNull();
    expect(localizeMessage('   ', 'en')).toBeNull();
  });

  it('traduce mensajes exactos y por plantilla', () => {
    expect(localizeMessage('Correo electrónico o contraseña incorrectos.', 'en')).toBe(
      'Incorrect email or password.'
    );
    expect(localizeMessage('La contraseña debe contener al menos 6 caracteres.', 'en')).toBe(
      'The password must contain at least 6 characters.'
    );
    expect(matchDomainMessage('La imagen excede el límite máximo permitido de 8 MB (9.3 MB).')).toEqual({
      key: 'messages.scanner.imageTooLarge',
      params: { size: '9.3' },
    });
  });

  it('un mensaje desconocido nunca se muestra crudo en inglés', () => {
    expect(localizeMessage('TypeError: undefined is not a function', 'en')).toBe(
      translate('en', 'common.genericError')
    );
    expect(
      localizeMessage('Fallo interno', 'en', { fallbackKey: 'messages.pantry.fallback' })
    ).toBe(translate('en', 'messages.pantry.fallback'));
    // Contenido (no errores) puede conservarse si se pide explícitamente
    expect(localizeMessage('Óptima', 'en', { passthroughUnknown: true })).toBe('Optimal');
    expect(localizeMessage('Texto del backend', 'en', { passthroughUnknown: true })).toBe('Texto del backend');
  });

  it('solo los parámetros canónicos (unit*/category*) se traducen; los nombres del usuario no', () => {
    expect(localizeCanonicalParam('unitPantry', 'unidad', 'en')).toBe('pc');
    expect(localizeCanonicalParam('category', 'Lácteos', 'en')).toBe('Dairy');
    expect(localizeCanonicalParam('name', 'Lácteos', 'en')).toBe('Lácteos');
    expect(
      localizeMessage('Unidades no compatibles (unidad vs g); requiere revisión manual.', 'en')
    ).toBe('Incompatible units (pc vs g); needs manual review.');
  });

  it('traduce errores por código estable y conserva el mensaje en español', () => {
    expect(localizeCodedError('recipes', 'NETWORK_ERROR', 'Mensaje original', 'es')).toBe('Mensaje original');
    expect(localizeCodedError('recipes', 'NETWORK_ERROR', 'Mensaje original', 'en')).toBe(
      translate('en', 'apiErrors.shared.NETWORK_ERROR')
    );
    expect(localizeCodedError('scanner', 'NETWORK_ERROR', 'x', 'en')).toBe(
      translate('en', 'apiErrors.scanner.NETWORK_ERROR')
    );
    expect(localizeCodedError('mealPlan', 'HTTP_500', 'Error del servidor sin traducir', 'en')).toBe(
      translate('en', 'apiErrors.mealPlan.fallback')
    );
    expect(localizeCodedError('mealPlan', null, null, 'en')).toBeNull();
    expect(localizeCodedError('recipes', 'EMPTY_PANTRY', null, 'es')).toBe(
      translate('es', 'apiErrors.recipes.EMPTY_PANTRY')
    );
  });

  it('cubre los mensajes de dominio existentes (sin deriva entre servicios y catálogo)', () => {
    const domainMessages = [
      ...Object.values(QUANTITY_ERROR_MESSAGES),
      UNIT_CHANGE_QUANTITY_ERROR,
      DEMO_RECIPE_CONSUMPTION_ERROR,
      INVALID_RECIPE_CONSUMPTION_ERROR,
      validateBudgetInput('').error!,
      validateBudgetInput('abc').error!,
      validateBudgetInput(-1).error!,
      validateBudgetInput(999999999).error!,
      validateServingsInput('').error!,
      validateServingsInput(1.5).error!,
      validateServingsInput(20).error!,
      validateMaxMinutesInput(2.5).error!,
      validateMaxMinutesInput(500).error!,
      mapSupabaseAuthError(new Error('Invalid login credentials')),
      mapSupabaseAuthError(new Error('Email not confirmed')),
      mapSupabaseAuthError(new Error('User already registered')),
      mapSupabaseAuthError(new Error('Password should be at least 6 characters')),
      mapSupabaseAuthError(new Error('rate limit')),
      mapSupabaseAuthError(new Error('Network request failed')),
      mapSupabaseAuthError(null),
    ];
    const validation = validateIngredientForm({
      name: '',
      quantityText: '',
      unit: 'invalida' as never,
      category: 'invalida' as never,
      expirationDateText: '2026-99-99',
    });
    domainMessages.push(...Object.values(validation.errors).filter(Boolean) as string[]);
    domainMessages.push(
      validateIngredientForm({ name: 'a', quantityText: '1', unit: 'g', category: 'Otros' }).errors.name!,
      validateIngredientForm({ name: 'a'.repeat(61), quantityText: '1', unit: 'g', category: 'Otros' }).errors.name!
    );

    const unmatched = domainMessages.filter((m) => matchDomainMessage(m) === null);
    expect(unmatched).toEqual([]);
    for (const message of domainMessages) {
      const english = localizeMessage(message, 'en')!;
      expect(english).not.toBe(message);
      expect(english).not.toBe(translate('en', 'common.genericError'));
    }
  });

  it('los avisos de persistencia del catálogo español coinciden con los contextos', () => {
    expect(es.persistence.mealPlan).toEqual(MEAL_PLAN_PERSISTENCE_WARNING_MESSAGES);
    expect(es.persistence.recipes).toEqual(RECIPE_PERSISTENCE_WARNING_MESSAGES);
  });

  it('los códigos de autenticación de la API tienen traducción en ambos idiomas', () => {
    for (const [code, spanish] of Object.entries(AUTH_ERROR_MESSAGES)) {
      expect(translate('es', `apiErrors.shared.${code}` as never)).toBe(spanish);
      expect(hasMessage('en', `apiErrors.shared.${code}`)).toBe(true);
    }
  });

  it('las advertencias semánticas se traducen por código y el español no cambia', () => {
    const inputs = [
      { name: 'Leche', unit: 'kg' as const, category: 'Lácteos' as const },
      { name: 'Arroz', unit: 'g' as const, category: 'Lácteos' as const },
      { name: 'Huevos', unit: 'l' as const, category: 'Carnes y proteínas' as const },
    ];
    let checked = 0;
    for (const input of inputs) {
      for (const warning of detectIngredientSemanticWarnings(input)) {
        checked += 1;
        expect(formatSemanticWarning(warning, input, 'es')).toBe(warning.message);
        const english = formatSemanticWarning(warning, input, 'en');
        expect(english).toContain(input.name);
        expect(english).not.toMatch(/\{\w+\}/);
        expect(english).not.toBe(warning.message);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3);
    expect(formatUnitNameList(['g', 'kg', 'ml'], 'en')).toBe('Grams (g), Kilograms (kg) or Milliliters (ml)');
    expect(formatUnitNameList(['g', 'kg'], 'es')).toBe('Gramos (g) o Kilogramos (kg)');
  });
});
