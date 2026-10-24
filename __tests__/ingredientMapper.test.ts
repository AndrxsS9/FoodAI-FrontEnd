import {
  findDuplicateInPantry,
  inferIngredientCategory,
  mapBackendUnitToPantryUnit,
  mapDetectedToScannedItems,
  normalizeIngredientName,
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

  describe('findDuplicateInPantry', () => {
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
    ];

    it('finds exact and partial matches regardless of case or accents', () => {
      const match1 = findDuplicateInPantry('tomate', pantry);
      expect(match1).toBeDefined();
      expect(match1?.id).toBe('ing-1');
      expect(match1?.name).toBe('Tomate');

      const match2 = findDuplicateInPantry('Leche', pantry);
      expect(match2).toBeDefined();
      expect(match2?.id).toBe('ing-2');
    });

    it('returns undefined when no match exists', () => {
      expect(findDuplicateInPantry('Zanahoria', pantry)).toBeUndefined();
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
          name: 'Tomate',
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

      // Tomate con quantity real
      expect(mapped[1].name).toBe('Tomate');
      expect(mapped[1].quantity).toBe(4);
      expect(mapped[1].unit).toBe('unidad');
      expect(mapped[1].needsReview).toBe(false);
    });

    it('detects pantry duplicate and defaults action to add_to_existing', () => {
      const detected: BackendDetectedIngredient[] = [
        {
          name: 'Arroz blanco',
          quantity: 1,
          unit: 'kg',
          needsReview: false,
        },
      ];

      const mapped = mapDetectedToScannedItems(detected, pantry);

      expect(mapped[0].duplicateMatch).toBeDefined();
      expect(mapped[0].duplicateMatch?.id).toBe('pantry-1');
      expect(mapped[0].action).toBe('add_to_existing');
      expect(mapped[0].category).toBe('Granos y cereales');
    });
  });
});
