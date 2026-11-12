import {
  areUnitsCompatibleForAddition,
  combineIngredientQuantities,
  convertQuantity,
  findDuplicateInPantry,
  inferIngredientCategory,
  mapBackendUnitToPantryUnit,
  mapDetectedToScannedItems,
  normalizeIngredientName,
  stemSpanishWord,
} from '../src/utils/ingredientMapper';
import { Ingredient } from '../src/types/pantry';
import { BackendDetectedIngredient } from '../src/types/scanner';

describe('ingredientMapper', () => {
  describe('normalizeIngredientName', () => {
    it('normalizes lowercase, trims and removes accents', () => {
      expect(normalizeIngredientName('  Plátano Maduro  ')).toBe('platano maduro');
      expect(normalizeIngredientName('Cebolla Cabezona')).toBe('cebolla cabezona');
      expect(normalizeIngredientName('Champiñones')).toBe('champinones');
    });
  });

  describe('stemSpanishWord - Spanish plural normalization', () => {
    it('reduces "tomates" to "tomate" (not "tomat")', () => {
      expect(stemSpanishWord('tomates')).toBe('tomate');
      expect(stemSpanishWord('tomate')).toBe('tomate');
    });

    it('normalizes huevo ↔ huevos', () => {
      expect(stemSpanishWord('huevos')).toBe('huevo');
      expect(stemSpanishWord('huevo')).toBe('huevo');
    });

    it('normalizes limón ↔ limones', () => {
      expect(stemSpanishWord('limones')).toBe('limon');
      expect(stemSpanishWord('limon')).toBe('limon');
    });

    it('normalizes frijol ↔ frijoles', () => {
      expect(stemSpanishWord('frijoles')).toBe('frijol');
      expect(stemSpanishWord('frijol')).toBe('frijol');
    });

    it('normalizes arroz ↔ arroz (and arroces ↔ arroz)', () => {
      expect(stemSpanishWord('arroz')).toBe('arroz');
      expect(stemSpanishWord('arroces')).toBe('arroz');
    });

    it('preserves short words and avoids false matches (sal !== salsa, res !== fresas)', () => {
      expect(stemSpanishWord('sal')).toBe('sal');
      expect(stemSpanishWord('salsa')).toBe('salsa');
      expect(stemSpanishWord('sal')).not.toBe(stemSpanishWord('salsa'));

      expect(stemSpanishWord('res')).toBe('res');
      expect(stemSpanishWord('fresas')).toBe('fresa');
      expect(stemSpanishWord('res')).not.toBe(stemSpanishWord('fresas'));
    });
  });

  describe('inferIngredientCategory', () => {
    it('categorizes vegetables and fruits', () => {
      expect(inferIngredientCategory('Tomate chonto')).toBe('Verduras y frutas');
      expect(inferIngredientCategory('Aguacate hass')).toBe('Verduras y frutas');
      expect(inferIngredientCategory('Plátano verde')).toBe('Verduras y frutas');
      expect(inferIngredientCategory('Espinaca')).toBe('Verduras y frutas');
    });

    it('categorizes meats and proteins', () => {
      expect(inferIngredientCategory('Pechuga de pollo')).toBe('Carnes y proteínas');
      expect(inferIngredientCategory('Carne molida')).toBe('Carnes y proteínas');
      expect(inferIngredientCategory('Huevos')).toBe('Carnes y proteínas');
      expect(inferIngredientCategory('Atún en lata')).toBe('Carnes y proteínas');
    });

    it('categorizes dairy', () => {
      expect(inferIngredientCategory('Leche entera')).toBe('Lácteos');
      expect(inferIngredientCategory('Queso campesino')).toBe('Lácteos');
      expect(inferIngredientCategory('Mantequilla con sal')).toBe('Lácteos');
    });

    it('categorizes grains and cereals', () => {
      expect(inferIngredientCategory('Arroz blanco')).toBe('Granos y cereales');
      expect(inferIngredientCategory('Lentejas')).toBe('Granos y cereales');
      expect(inferIngredientCategory('Avena en hojuelas')).toBe('Granos y cereales');
      expect(inferIngredientCategory('Pasta espagueti')).toBe('Granos y cereales');
    });

    it('categorizes pantry essentials', () => {
      expect(inferIngredientCategory('Aceite de oliva')).toBe('Alacena');
      expect(inferIngredientCategory('Sal marina')).toBe('Alacena');
      expect(inferIngredientCategory('Pimienta negra')).toBe('Alacena');
    });

    it('falls back to Otros for unknown foods', () => {
      expect(inferIngredientCategory('Elemento misterioso')).toBe('Otros');
    });
  });

  describe('findDuplicateInPantry - Conservative duplicate matching', () => {
    const pantry: Ingredient[] = [
      {
        id: 'ing-1',
        name: 'Tomate',
        quantity: 3,
        unit: 'unidad',
        category: 'Verduras y frutas',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'ing-2',
        name: 'Leche entera',
        quantity: 1,
        unit: 'l',
        category: 'Lácteos',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'ing-3',
        name: 'Salsa de tomate',
        quantity: 1,
        unit: 'unidad',
        category: 'Alacena',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'ing-4',
        name: 'Fresas',
        quantity: 500,
        unit: 'g',
        category: 'Verduras y frutas',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'ing-5',
        name: 'Arroz',
        quantity: 2,
        unit: 'kg',
        category: 'Granos y cereales',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'ing-6',
        name: 'Huevo',
        quantity: 12,
        unit: 'unidad',
        category: 'Carnes y proteínas',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'ing-7',
        name: 'Limón',
        quantity: 4,
        unit: 'unidad',
        category: 'Verduras y frutas',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'ing-8',
        name: 'Frijol',
        quantity: 1,
        unit: 'kg',
        category: 'Granos y cereales',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    it('matches common singular/plural food pairs conservatively (tomate/tomates, huevo/huevos, limón/limones, frijol/frijoles, arroz/arroz)', () => {
      // tomate <-> tomates
      const matchTomates = findDuplicateInPantry('tomates', pantry);
      expect(matchTomates).toBeDefined();
      expect(matchTomates?.id).toBe('ing-1');
      expect(matchTomates?.name).toBe('Tomate');
      expect(matchTomates?.matchType).toBe('exact');

      const matchTomate = findDuplicateInPantry('tomate', pantry);
      expect(matchTomate?.id).toBe('ing-1');
      expect(matchTomate?.matchType).toBe('exact');

      // huevo <-> huevos
      const matchHuevos = findDuplicateInPantry('huevos', pantry);
      expect(matchHuevos?.id).toBe('ing-6');
      expect(matchHuevos?.name).toBe('Huevo');
      expect(matchHuevos?.matchType).toBe('exact');

      const matchHuevo = findDuplicateInPantry('huevo', pantry);
      expect(matchHuevo?.id).toBe('ing-6');
      expect(matchHuevo?.matchType).toBe('exact');

      // limón <-> limones
      const matchLimones = findDuplicateInPantry('limones', pantry);
      expect(matchLimones?.id).toBe('ing-7');
      expect(matchLimones?.name).toBe('Limón');
      expect(matchLimones?.matchType).toBe('exact');

      const matchLimon = findDuplicateInPantry('limon', pantry);
      expect(matchLimon?.id).toBe('ing-7');
      expect(matchLimon?.matchType).toBe('exact');

      // frijol <-> frijoles
      const matchFrijoles = findDuplicateInPantry('frijoles', pantry);
      expect(matchFrijoles?.id).toBe('ing-8');
      expect(matchFrijoles?.name).toBe('Frijol');
      expect(matchFrijoles?.matchType).toBe('exact');

      const matchFrijol = findDuplicateInPantry('frijol', pantry);
      expect(matchFrijol?.id).toBe('ing-8');
      expect(matchFrijol?.matchType).toBe('exact');

      // arroz <-> arroz
      const matchArroz = findDuplicateInPantry('arroz', pantry);
      expect(matchArroz?.id).toBe('ing-5');
      expect(matchArroz?.name).toBe('Arroz');
      expect(matchArroz?.matchType).toBe('exact');
    });

    it('finds exact matches regardless of case or accents as matchType exact', () => {
      const match1 = findDuplicateInPantry('TOMATE', pantry);
      expect(match1).toBeDefined();
      expect(match1?.id).toBe('ing-1');
      expect(match1?.name).toBe('Tomate');
      expect(match1?.matchType).toBe('exact');

      const matchArroz = findDuplicateInPantry('arroz', pantry);
      expect(matchArroz).toBeDefined();
      expect(matchArroz?.id).toBe('ing-5');
      expect(matchArroz?.matchType).toBe('exact');
    });

    it('does NOT treat "sal" and "salsa" as confirmed duplicates (returns undefined)', () => {
      const matchSal = findDuplicateInPantry('sal', pantry);
      expect(matchSal).toBeUndefined();
    });

    it('does NOT treat "res" and "fresas" as confirmed duplicates (returns undefined)', () => {
      const matchRes = findDuplicateInPantry('carne de res', pantry);
      expect(matchRes).toBeUndefined();
      const matchResDirect = findDuplicateInPantry('res', pantry);
      expect(matchResDirect).toBeUndefined();
    });

    it('treats qualified names like "tomate chonto" as possible matches requiring confirmation', () => {
      const matchChonto = findDuplicateInPantry('Tomate chonto', pantry);
      expect(matchChonto).toBeDefined();
      expect(matchChonto?.id).toBe('ing-1');
      expect(matchChonto?.name).toBe('Tomate');
      expect(matchChonto?.matchType).toBe('possible');
    });

    it('treats "arroz blanco" as possible match against "Arroz"', () => {
      const matchArroz = findDuplicateInPantry('Arroz blanco', pantry);
      expect(matchArroz).toBeDefined();
      expect(matchArroz?.id).toBe('ing-5');
      expect(matchArroz?.matchType).toBe('possible');
    });

    it('returns undefined when no match exists', () => {
      expect(findDuplicateInPantry('Zanahoria', pantry)).toBeUndefined();
    });
  });

  describe('areUnitsCompatibleForAddition and convertQuantity', () => {
    it('recognizes identical units as compatible', () => {
      expect(areUnitsCompatibleForAddition('g', 'g')).toBe(true);
      expect(areUnitsCompatibleForAddition('kg', 'kg')).toBe(true);
      expect(areUnitsCompatibleForAddition('ml', 'ml')).toBe(true);
      expect(areUnitsCompatibleForAddition('l', 'l')).toBe(true);
      expect(areUnitsCompatibleForAddition('unidad', 'unidad')).toBe(true);
    });

    it('recognizes mass conversions g <-> kg as compatible', () => {
      expect(areUnitsCompatibleForAddition('g', 'kg')).toBe(true);
      expect(areUnitsCompatibleForAddition('kg', 'g')).toBe(true);
      expect(convertQuantity(500, 'g', 'kg')).toBe(0.5);
      expect(convertQuantity(2, 'kg', 'g')).toBe(2000);
    });

    it('recognizes volume conversions ml <-> l as compatible', () => {
      expect(areUnitsCompatibleForAddition('ml', 'l')).toBe(true);
      expect(areUnitsCompatibleForAddition('l', 'ml')).toBe(true);
      expect(convertQuantity(250, 'ml', 'l')).toBe(0.25);
      expect(convertQuantity(1.5, 'l', 'ml')).toBe(1500);
    });

    it('marks incompatible cross-domain units as incompatible', () => {
      expect(areUnitsCompatibleForAddition('g', 'unidad')).toBe(false);
      expect(areUnitsCompatibleForAddition('kg', 'l')).toBe(false);
      expect(areUnitsCompatibleForAddition('ml', 'g')).toBe(false);
      expect(areUnitsCompatibleForAddition('desconocida', 'kg')).toBe(false);
      expect(areUnitsCompatibleForAddition('taza', 'kg')).toBe(false);
    });
  });

  describe('combineIngredientQuantities - Safe duplicate quantity handling', () => {
    it('calculates 2 kg + 500 g = 2.5 kg', () => {
      const result = combineIngredientQuantities(2, 'kg', 500, 'g');
      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(2.5);
      expect(result.unit).toBe('kg');
    });

    it('calculates 500 g + 1 kg = 1500 g', () => {
      const result = combineIngredientQuantities(500, 'g', 1, 'kg');
      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(1500);
      expect(result.unit).toBe('g');
    });

    it('calculates 1 l + 250 ml = 1.25 l', () => {
      const result = combineIngredientQuantities(1, 'l', 250, 'ml');
      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(1.25);
      expect(result.unit).toBe('l');
    });

    it('calculates 250 ml + 1 l = 1250 ml', () => {
      const result = combineIngredientQuantities(250, 'ml', 1, 'l');
      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(1250);
      expect(result.unit).toBe('ml');
    });

    it('sums same units directly: 3 unidad + 2 unidad = 5 unidad', () => {
      const result = combineIngredientQuantities(3, 'unidad', 2, 'unidad');
      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(5);
      expect(result.unit).toBe('unidad');
    });

    it('never adds incompatible units silently (returns success: false)', () => {
      const result1 = combineIngredientQuantities(2, 'kg', 3, 'unidad');
      expect(result1.success).toBe(false);
      expect(result1.newQuantity).toBe(2);
      expect(result1.error).toBeDefined();

      const result2 = combineIngredientQuantities(1, 'l', 500, 'g');
      expect(result2.success).toBe(false);

      const result3 = combineIngredientQuantities(1, 'unidad', 250, 'ml');
      expect(result3.success).toBe(false);
    });
  });

  describe('mapBackendUnitToPantryUnit', () => {
    it('maps backend units to valid pantry units', () => {
      expect(mapBackendUnitToPantryUnit('unidad')).toBe('unidad');
      expect(mapBackendUnitToPantryUnit('g')).toBe('g');
      expect(mapBackendUnitToPantryUnit('kg')).toBe('kg');
      expect(mapBackendUnitToPantryUnit('ml')).toBe('ml');
      expect(mapBackendUnitToPantryUnit('l')).toBe('l');
      expect(mapBackendUnitToPantryUnit('desconocida')).toBe('desconocida');
      expect(mapBackendUnitToPantryUnit('algo_raro')).toBe('desconocida');
    });
  });

  describe('mapDetectedToScannedItems', () => {
    const pantry: Ingredient[] = [
      {
        id: 'pantry-1',
        name: 'Arroz',
        quantity: 2,
        unit: 'kg',
        category: 'Granos y cereales',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'pantry-2',
        name: 'Huevos',
        quantity: 6,
        unit: 'unidad',
        category: 'Carnes y proteínas',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    it('preserves null quantity and never invents 1 or arbitrary values', () => {
      const detected: BackendDetectedIngredient[] = [
        {
          name: 'Cebolla',
          quantity: null,
          unit: 'desconocida',
          needsReview: true,
        },
        {
          name: 'Zanahoria',
          quantity: 4,
          unit: 'unidad',
          needsReview: false,
        },
      ];

      const mapped = mapDetectedToScannedItems(detected, pantry);

      expect(mapped).toHaveLength(2);

      // Cebolla con quantity: null preservado
      expect(mapped[0].name).toBe('Cebolla');
      expect(mapped[0].quantity).toBeNull();
      expect(mapped[0].needsReview).toBe(true);
      expect(mapped[0].isSelected).toBe(true);

      // Zanahoria con quantity real
      expect(mapped[1].name).toBe('Zanahoria');
      expect(mapped[1].quantity).toBe(4);
      expect(mapped[1].unit).toBe('unidad');
      expect(mapped[1].needsReview).toBe(false);
    });

    it('detects exact compatible duplicate and defaults to add_to_existing', () => {
      const detected: BackendDetectedIngredient[] = [
        {
          name: 'Arroz',
          quantity: 500,
          unit: 'g', // g es compatible con kg
          needsReview: false,
        },
      ];

      const mapped = mapDetectedToScannedItems(detected, pantry);

      expect(mapped[0].duplicateMatch).toBeDefined();
      expect(mapped[0].duplicateMatch?.id).toBe('pantry-1');
      expect(mapped[0].duplicateMatch?.matchType).toBe('exact');
      expect(mapped[0].action).toBe('add_to_existing');
      expect(mapped[0].needsReview).toBe(false);
    });

    it('requires confirmation for ambiguous/possible matches by defaulting action to create and needsReview to true', () => {
      const detected: BackendDetectedIngredient[] = [
        {
          name: 'Arroz integral',
          quantity: 1,
          unit: 'kg',
          needsReview: false,
        },
      ];

      const mapped = mapDetectedToScannedItems(detected, pantry);

      expect(mapped[0].duplicateMatch).toBeDefined();
      expect(mapped[0].duplicateMatch?.matchType).toBe('possible');
      expect(mapped[0].action).toBe('create');
      expect(mapped[0].needsReview).toBe(true);
    });

    it('defaults action to create and flags needsReview if units are incompatible', () => {
      const detected: BackendDetectedIngredient[] = [
        {
          name: 'Huevos',
          quantity: 500,
          unit: 'g', // g es incompatible con unidad
          needsReview: false,
        },
      ];

      const mapped = mapDetectedToScannedItems(detected, pantry);

      expect(mapped[0].duplicateMatch).toBeDefined();
      expect(mapped[0].action).toBe('create');
      expect(mapped[0].needsReview).toBe(true);
    });
  });
});
