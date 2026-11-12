/**
 * FoodAI - Fase 28A: clasificación inteligente de alimentos y validación de medidas (dominio).
 *
 * Cubre:
 * 1-5. Categoría y unidades para leche líquida, leche en polvo, arroz, huevos y aceite de oliva.
 * 6.   Nombres desconocidos o ambiguos sin certeza inventada.
 * 9.   Combinaciones sospechosas detectadas como advertencias (no como errores).
 * 11.  El mapeo del escáner conserva cantidades y unidades detectadas.
 * 12.  Compatibilidad con datos persistidos (categorías antiguas, sin campos nuevos).
 * 13.  Reglas de conversión g/kg y ml/l intactas; nunca masa↔volumen.
 * 14.  Consumo de recetas y rollback sin cambios de comportamiento.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  areUnitsCompatibleForAddition,
  classifyIngredient,
  combineIngredientQuantities,
  convertQuantity,
  getUnitChangeImpact,
  inferIngredientCategory,
  mapDetectedToScannedItems,
  suggestIngredientMeasurement,
} from '../src/utils/ingredientMapper';
import {
  detectIngredientSemanticWarnings,
  getScannedItemSemanticWarnings,
  getSemanticCheckSignature,
  isScannedItemSemanticallyConfirmed,
  validateIngredientForm,
} from '../src/utils/pantryValidation';
import { applyPantryDeduction, calculatePantryDeduction } from '../src/utils/pantryConsumption';
import { rollbackPantryDeductions, RollbackInconsistencyError } from '../src/context/PantryContext';
import {
  AsyncStoragePantryAdapter,
  PantryStorageAdapter,
} from '../src/services/storage/pantryStorage';
import { ConsumedIngredientDeduction } from '../src/services/storage/recipeConsumptionStorage';
import { Ingredient } from '../src/types/pantry';

describe('Fase 28A · Sugerencias de categoría y unidad (casos obligatorios)', () => {
  it('1. leche líquida → Lácteos con unidades de volumen', () => {
    for (const name of ['Leche líquida', 'Leche', 'leche ENTERA', '  Leche   deslactosada ']) {
      expect(inferIngredientCategory(name)).toBe('Lácteos');
      const m = suggestIngredientMeasurement(name);
      expect(m.confidence).toBe('high');
      expect(m.presentation).toBe('liquid');
      expect(m.suggestedUnits.sort()).toEqual(['l', 'ml']);
      expect(['l', 'ml']).toContain(m.preferredUnit);
    }
  });

  it('2. leche en polvo → Lácteos con unidades de masa (no todo lácteo es líquido)', () => {
    expect(inferIngredientCategory('Leche en polvo')).toBe('Lácteos');
    const m = suggestIngredientMeasurement('Leche en polvo');
    expect(m.presentation).toBe('powder');
    expect(m.suggestedUnits.sort()).toEqual(['g', 'kg']);
    expect(['g', 'kg']).toContain(m.preferredUnit);
  });

  it('leches vegetales y bebidas vegetales NO se clasifican como lácteos animales', () => {
    const plantMilks = [
      { name: 'Leche de almendras', expectedCat: 'Otros', expectedUnit: 'l' },
      { name: 'Leche de almendra', expectedCat: 'Otros', expectedUnit: 'l' },
      { name: 'Leche de avena', expectedCat: 'Otros', expectedUnit: 'l' },
      { name: 'Leche de soya', expectedCat: 'Otros', expectedUnit: 'l' },
      { name: 'Leche de soja', expectedCat: 'Otros', expectedUnit: 'l' },
      { name: 'Bebida vegetal', expectedCat: 'Otros', expectedUnit: 'l' },
      { name: 'Leche de coco', expectedCat: 'Alacena', expectedUnit: 'ml' },
    ];

    for (const item of plantMilks) {
      const cat = inferIngredientCategory(item.name);
      expect(cat).not.toBe('Lácteos');
      expect(cat).toBe(item.expectedCat);

      const m = suggestIngredientMeasurement(item.name);
      expect(m.confidence).toBe('high');
      expect(m.presentation).toBe('liquid');
      expect(m.suggestedUnits).toEqual(expect.arrayContaining(['l', 'ml']));
      expect(m.preferredUnit).toBe(item.expectedUnit);

      // Si se fuerza la categoría animal Lácteos, genera advertencia semántica
      const warnings = detectIngredientSemanticWarnings({
        name: item.name,
        category: 'Lácteos',
        unit: 'l',
      });
      expect(warnings.some((w) => w.code === 'category_mismatch')).toBe(true);
    }
  });

  it('preserva leche animal (líquida y en polvo) en Lácteos con medidas según presentación física', () => {
    // Leche animal líquida
    for (const animalMilk of ['Leche', 'Leche entera', 'Leche de vaca', 'Leche líquida']) {
      expect(inferIngredientCategory(animalMilk)).toBe('Lácteos');
      const m = suggestIngredientMeasurement(animalMilk);
      expect(m.presentation).toBe('liquid');
      expect(m.suggestedUnits.sort()).toEqual(['l', 'ml']);
    }
    // Leche animal en polvo
    for (const powderedMilk of ['Leche en polvo', 'Leche entera en polvo']) {
      expect(inferIngredientCategory(powderedMilk)).toBe('Lácteos');
      const m = suggestIngredientMeasurement(powderedMilk);
      expect(m.presentation).toBe('powder');
      expect(m.suggestedUnits.sort()).toEqual(['g', 'kg']);
    }
  });

  it('3. arroz → Granos y cereales con unidades de masa', () => {
    expect(inferIngredientCategory('Arroz')).toBe('Granos y cereales');
    expect(suggestIngredientMeasurement('Arroz').suggestedUnits.sort()).toEqual(['g', 'kg']);
  });

  it('4. huevos → Carnes y proteínas contados por unidad', () => {
    expect(inferIngredientCategory('Huevos')).toBe('Carnes y proteínas');
    const m = suggestIngredientMeasurement('Huevos');
    expect(m.suggestedUnits).toEqual(['unidad']);
    expect(m.preferredUnit).toBe('unidad');
  });

  it('5. aceite de oliva → Alacena con unidades de volumen', () => {
    expect(inferIngredientCategory('Aceite de oliva')).toBe('Alacena');
    expect(suggestIngredientMeasurement('Aceite de oliva').suggestedUnits.sort()).toEqual(['l', 'ml']);
  });

  it('tabla de la especificación: pollo, zanahoria, yogur y manzana', () => {
    expect(inferIngredientCategory('Pollo')).toBe('Carnes y proteínas');
    expect(suggestIngredientMeasurement('Pollo').suggestedUnits.sort()).toEqual(['g', 'kg']);
    expect(inferIngredientCategory('Zanahoria')).toBe('Verduras y frutas');
    expect(inferIngredientCategory('Yogur')).toBe('Lácteos');
    expect(suggestIngredientMeasurement('Yogur líquido').suggestedUnits.sort()).toEqual(['l', 'ml']);
    expect(suggestIngredientMeasurement('Yogur sólido').suggestedUnits.sort()).toEqual(['g', 'kg']);
    expect(suggestIngredientMeasurement('Yogur griego').presentation).toBe('solid');
    expect(suggestIngredientMeasurement('Manzana').suggestedUnits.sort()).toEqual(['g', 'kg', 'unidad']);
  });

  it('normaliza mayúsculas, tildes, eñes, plurales y espacios extra', () => {
    expect(inferIngredientCategory('  ACEITE    DE   OLIVA ')).toBe('Alacena');
    expect(inferIngredientCategory('Champiñones')).toBe('Verduras y frutas');
    expect(inferIngredientCategory('Piña')).toBe('Verduras y frutas');
    expect(inferIngredientCategory('Lentejas')).toBe('Granos y cereales');
    expect(inferIngredientCategory('Yogures')).toBe('Lácteos');
  });

  it('omite envases y cantidades iniciales para encontrar el alimento real', () => {
    expect(inferIngredientCategory('Bolsa de leche')).toBe('Lácteos');
    expect(inferIngredientCategory('Media docena de huevos')).toBe('Carnes y proteínas');
    expect(inferIngredientCategory('2 kg de arroz')).toBe('Granos y cereales');
  });

  it('evita falsos positivos por subcadenas de palabras no relacionadas', () => {
    // «pina» dentro de «espinaca», «sal» dentro de «salsa», «res» dentro de «fresa»
    expect(classifyIngredient('Espinaca').matchedTerm).toBe('espinaca');
    expect(classifyIngredient('Salsa').matchedTerm).toBe('salsa');
    expect(inferIngredientCategory('Fresas')).toBe('Verduras y frutas');
    // «leche» no coincide con «lechuga»
    expect(inferIngredientCategory('Lechuga')).toBe('Verduras y frutas');
    // El núcleo del nombre manda: salsa de tomate es de alacena, no una verdura
    expect(inferIngredientCategory('Salsa de tomate')).toBe('Alacena');
    expect(inferIngredientCategory('Pasta de tomate')).toBe('Alacena');
  });

  it('una presentación «variable» reconoce la categoría pero no impone unidad', () => {
    const m = suggestIngredientMeasurement('Yogur');
    expect(m.confidence).toBe('low');
    expect(m.preferredUnit).toBeNull();
    expect(m.suggestedUnits).toEqual(expect.arrayContaining(['ml', 'g']));
  });

  it('modificadores contradictorios no inventan certeza', () => {
    const m = suggestIngredientMeasurement('Leche líquida en polvo');
    expect(m.preferredUnit).toBeNull();
    expect(m.confidence).toBe('low');
  });
});

describe('Fase 28A · 6. Nombres desconocidos o ambiguos', () => {
  it.each(['Elemento misterioso', 'Producto XYZ', 'Sopa de pollo', 'Galletas de avena', ''])(
    '«%s» no recibe categoría ni unidad engañosa',
    (name) => {
      const c = classifyIngredient(name);
      expect(c.category).toBeNull();
      expect(c.presentation).toBeNull();
      expect(inferIngredientCategory(name)).toBe('Otros');
      const m = suggestIngredientMeasurement(name);
      expect(m.preferredUnit).toBeNull();
      expect(m.suggestedUnits).toEqual([]);
      expect(m.confidence).toBe('none');
    }
  );

  it('solo reconocer un término secundario se reporta como confianza baja', () => {
    const c = classifyIngredient('Sopa de pollo');
    expect(c.confidence).toBe('low');
    expect(c.possibleCategory).toBe('Carnes y proteínas');
  });

  it('nunca genera advertencias semánticas para nombres desconocidos', () => {
    expect(
      detectIngredientSemanticWarnings({ name: 'Producto XYZ', unit: 'l', category: 'Granos y cereales' })
    ).toEqual([]);
  });

  it('acepta entradas no textuales sin lanzar errores', () => {
    expect(inferIngredientCategory(undefined as unknown as string)).toBe('Otros');
  });
});

describe('Fase 28A · 9. Validación semántica con confirmación', () => {
  const codes = (name: string, unit: Ingredient['unit'], category: Ingredient['category']) =>
    detectIngredientSemanticWarnings({ name, unit, category }).map((w) => w.code);

  it('leche líquida clasificada como granos', () => {
    expect(codes('Leche', 'l', 'Granos y cereales')).toEqual(['category_mismatch']);
  });

  it('leche líquida medida en kilogramos sin aclaración', () => {
    expect(codes('Leche', 'kg', 'Lácteos')).toEqual(['liquid_measured_by_mass']);
    // Con aclaración explícita en el nombre deja de ser sospechoso
    expect(codes('Leche en polvo', 'kg', 'Lácteos')).toEqual([]);
  });

  it('arroz clasificado como lácteo', () => {
    expect(codes('Arroz', 'kg', 'Lácteos')).toEqual(['category_mismatch']);
  });

  it('huevos medidos en litros', () => {
    expect(codes('Huevos', 'l', 'Carnes y proteínas')).toEqual(['countable_measured_by_volume']);
  });

  it('no es demasiado estricta con presentaciones legítimas', () => {
    expect(codes('Leche', 'unidad', 'Lácteos')).toEqual([]); // bolsas de leche
    expect(codes('Arroz', 'unidad', 'Alacena')).toEqual([]); // paquete en la alacena
    expect(codes('Huevos', 'unidad', 'Lácteos')).toEqual([]); // huevos junto a lácteos
    expect(codes('Huevos', 'g', 'Carnes y proteínas')).toEqual([]);
    expect(codes('Leche', 'taza', 'Lácteos')).toEqual([]); // medidas de cocina
    expect(codes('Leche', 'desconocida', 'Lácteos')).toEqual([]);
    expect(codes('Lentejas', 'g', 'Carnes y proteínas')).toEqual([]); // legumbre como proteína
    expect(codes('Leche', 'l', 'Otros')).toEqual([]); // «Otros» siempre es neutral
    expect(codes('Yogur', 'kg', 'Lácteos')).toEqual([]); // presentación variable
  });

  it('las advertencias no invalidan el formulario ni alteran los datos saneados', () => {
    const result = validateIngredientForm({
      name: 'Leche',
      quantityText: '2',
      unit: 'kg',
      category: 'Granos y cereales',
    });
    expect(result.isValid).toBe(true);
    expect(result.sanitizedData).toEqual({
      name: 'Leche',
      quantity: 2,
      unit: 'kg',
      category: 'Granos y cereales',
      expirationDate: undefined,
    });
    expect(result.warnings.map((w) => w.code).sort()).toEqual([
      'category_mismatch',
      'liquid_measured_by_mass',
    ]);
    expect(result.warnings[0].message).toContain('Leche');
  });

  it('las advertencias ofrecen la corrección recomendada', () => {
    const [categoryWarning] = detectIngredientSemanticWarnings({
      name: 'Arroz',
      unit: 'kg',
      category: 'Lácteos',
    });
    expect(categoryWarning.suggestedCategory).toBe('Granos y cereales');
    const [unitWarning] = detectIngredientSemanticWarnings({
      name: 'Huevos',
      unit: 'ml',
      category: 'Carnes y proteínas',
    });
    expect(unitWarning.suggestedUnits).toEqual(['unidad']);
  });
});

describe('Fase 28A · 11. Escáner: medidas detectadas preservadas', () => {
  it('mapDetectedToScannedItems conserva cantidad y unidad de la IA aunque sean inusuales', () => {
    const items = mapDetectedToScannedItems(
      [
        { name: 'Leche', quantity: 1, unit: 'kg', needsReview: false },
        { name: 'Arroz', quantity: 500, unit: 'g', needsReview: false },
        { name: 'Huevos', quantity: 12, unit: 'unidad', needsReview: false },
        { name: 'Cebolla', quantity: null, unit: 'desconocida', needsReview: true },
      ],
      []
    );
    expect(items.map((i) => [i.name, i.quantity, i.unit, i.category])).toEqual([
      ['Leche', 1, 'kg', 'Lácteos'],
      ['Arroz', 500, 'g', 'Granos y cereales'],
      ['Huevos', 12, 'unidad', 'Carnes y proteínas'],
      ['Cebolla', null, 'desconocida', 'Verduras y frutas'],
    ]);
    expect(items.every((i) => i.semanticReviewSignature === undefined)).toBe(true);
  });

  it('marca la combinación sospechosa y exige reconfirmar si el ítem cambia', () => {
    const [leche] = mapDetectedToScannedItems(
      [{ name: 'Leche', quantity: 1, unit: 'kg', needsReview: false }],
      []
    );
    expect(getScannedItemSemanticWarnings(leche).map((w) => w.code)).toEqual([
      'liquid_measured_by_mass',
    ]);
    expect(isScannedItemSemanticallyConfirmed(leche)).toBe(false);

    const confirmed = { ...leche, semanticReviewSignature: getSemanticCheckSignature(leche) };
    expect(isScannedItemSemanticallyConfirmed(confirmed)).toBe(true);
    // Cambiar la unidad invalida la confirmación anterior
    expect(isScannedItemSemanticallyConfirmed({ ...confirmed, unit: 'g' })).toBe(false);
  });

  it('al sumar a un registro existente solo se revisa la unidad (la categoría no se guarda)', () => {
    const item = {
      name: 'Leche',
      unit: 'l' as const,
      category: 'Verduras y frutas' as const, // categoría heredada del registro existente
      action: 'add_to_existing' as const,
    };
    expect(getScannedItemSemanticWarnings(item)).toEqual([]);
    expect(getScannedItemSemanticWarnings({ ...item, action: 'create' })).toHaveLength(1);
  });

  it('las coincidencias de duplicados conservan la categoría del registro existente', () => {
    const pantry: Ingredient[] = [
      {
        id: 'legacy-leche',
        name: 'Leche',
        quantity: 2,
        unit: 'l',
        category: 'Verduras y frutas',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const [item] = mapDetectedToScannedItems(
      [{ name: 'Leche', quantity: 1, unit: 'l', needsReview: false }],
      pantry
    );
    expect(item.category).toBe('Verduras y frutas');
    expect(item.action).toBe('add_to_existing');
    expect(item.quantity).toBe(1);
    expect(item.unit).toBe('l');
  });
});

describe('Fase 28A · 12. Compatibilidad con datos persistidos', () => {
  const STORAGE_KEY = '@foodai:test_phase28a_legacy';

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('lee registros antiguos con categorías «incorrectas» sin modificarlos', async () => {
    const legacy: Ingredient[] = [
      {
        id: 'old-1',
        name: 'Leche',
        quantity: 1,
        unit: 'unidad',
        category: 'Verduras y frutas', // antiguo valor por defecto del formulario
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'old-2',
        name: 'Arroz',
        quantity: 3,
        unit: 'l',
        category: 'Lácteos',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, updatedAt: '2026-01-01T00:00:00.000Z', ingredients: legacy })
    );

    const stored = await new AsyncStoragePantryAdapter(STORAGE_KEY).getIngredients();
    expect(stored).toEqual(legacy);
  });

  it('los registros nuevos mantienen exactamente el mismo esquema', async () => {
    const adapter = new AsyncStoragePantryAdapter(STORAGE_KEY);
    const created = await adapter.addIngredient({
      name: 'Leche en polvo',
      quantity: 400,
      unit: 'g',
      category: 'Lácteos',
    });
    // Solo los campos del modelo Ingredient existente; nada de metadatos de sugerencia o revisión
    const allowed = [
      'id',
      'name',
      'quantity',
      'unit',
      'category',
      'expirationDate',
      'createdAt',
      'updatedAt',
    ];
    expect(Object.keys(created).every((key) => allowed.includes(key))).toBe(true);
    expect(created).not.toHaveProperty('semanticReviewSignature');
    expect(created).toMatchObject({ quantity: 400, unit: 'g', category: 'Lácteos' });
  });
});

describe('Fase 28A · 13. Conversiones g/kg y ml/l sin cambios', () => {
  it('mantiene las conversiones seguras existentes', () => {
    expect(convertQuantity(500, 'g', 'kg')).toBe(0.5);
    expect(convertQuantity(2, 'kg', 'g')).toBe(2000);
    expect(convertQuantity(250, 'ml', 'l')).toBe(0.25);
    expect(convertQuantity(1.5, 'l', 'ml')).toBe(1500);
    expect(combineIngredientQuantities(1, 'kg', 500, 'g')).toEqual({
      success: true,
      newQuantity: 1.5,
      unit: 'kg',
    });
  });

  it('nunca convierte masa en volumen ni conteo en masa', () => {
    expect(convertQuantity(1, 'kg', 'l')).toBeNull();
    expect(convertQuantity(1, 'l', 'g')).toBeNull();
    expect(convertQuantity(1, 'unidad', 'g')).toBeNull();
    expect(areUnitsCompatibleForAddition('kg', 'l')).toBe(false);
    expect(combineIngredientQuantities(1, 'l', 1, 'kg').success).toBe(false);
  });

  it('getUnitChangeImpact distingue cambios convertibles de cambios de significado', () => {
    expect(getUnitChangeImpact('g', 'g')).toBe('same');
    expect(getUnitChangeImpact('g', 'kg')).toBe('convertible');
    expect(getUnitChangeImpact('ml', 'l')).toBe('convertible');
    expect(getUnitChangeImpact('l', 'kg')).toBe('different_meaning');
    expect(getUnitChangeImpact('unidad', 'g')).toBe('different_meaning');
    expect(getUnitChangeImpact('taza', 'ml')).toBe('different_meaning');
  });
});

describe('Fase 28A · 14. Consumo de recetas y rollback sin regresiones', () => {
  const pantry: Ingredient[] = [
    {
      id: 'p-leche-polvo',
      name: 'Leche en polvo',
      quantity: 400,
      unit: 'g',
      category: 'Lácteos',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'p-arroz',
      name: 'Arroz',
      quantity: 1,
      unit: 'kg',
      category: 'Granos y cereales',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  it('una receta en ml sobre leche en polvo (g) exige revisión: nunca convierte masa↔volumen', () => {
    const plan = calculatePantryDeduction(pantry, [
      { name: 'Leche en polvo', quantity: 200, unit: 'ml' },
    ]);
    expect(plan.items[0].status).toBe('requires_review_unit');
    expect(plan.canDeductAny).toBe(false);
  });

  it('las deducciones compatibles g/kg siguen funcionando igual', () => {
    const plan = calculatePantryDeduction(pantry, [{ name: 'Arroz', quantity: 250, unit: 'g' }]);
    expect(plan.items[0].status).toBe('deductible_full');
    const { updatedPantry } = applyPantryDeduction(pantry, plan);
    expect(updatedPantry.find((i) => i.id === 'p-arroz')?.quantity).toBe(0.75);
    expect(updatedPantry.find((i) => i.id === 'p-arroz')?.unit).toBe('kg');
    // La leche en polvo no se toca
    expect(updatedPantry.find((i) => i.id === 'p-leche-polvo')?.quantity).toBe(400);
  });

  it('el rollback restaura exactamente y aborta ante inconsistencias', async () => {
    let data: Ingredient[] = pantry.map((i) =>
      i.id === 'p-arroz' ? { ...i, quantity: 0.75 } : { ...i }
    );
    const storage: PantryStorageAdapter = {
      getIngredients: async () => data.map((i) => ({ ...i })),
      saveIngredients: async (items) => {
        data = items.map((i) => ({ ...i }));
      },
      addIngredient: async () => {
        throw new Error('no usado');
      },
      updateIngredient: async () => {
        throw new Error('no usado');
      },
      deleteIngredient: async () => {},
      clearIngredients: async () => {},
    };
    const deductions: ConsumedIngredientDeduction[] = [
      {
        ingredientId: 'p-arroz',
        ingredientName: 'Arroz',
        deductedQuantity: 0.25,
        unit: 'kg',
        stockBefore: 1,
        stockAfter: 0.75,
      },
    ];

    await rollbackPantryDeductions(storage, deductions);
    expect(data.find((i) => i.id === 'p-arroz')?.quantity).toBe(1);
    // Segundo rollback: el stock ya no coincide con stockAfter → se aborta sin mutar
    await expect(rollbackPantryDeductions(storage, deductions)).rejects.toThrow(
      RollbackInconsistencyError
    );
    expect(data.find((i) => i.id === 'p-arroz')?.quantity).toBe(1);
  });
});
