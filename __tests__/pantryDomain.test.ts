/**
 * Pruebas unitarias para el modelo del dominio de despensa, estado de vencimiento
 * y validaciones del formulario de ingredientes (Fase 2B).
 */
import {
  INGREDIENT_CATEGORIES,
  INGREDIENT_UNITS,
  getExpirationStatus,
} from '../src/types/pantry';
import {
  isValidDateString,
  isValidQuantityValue,
  parseQuantityInput,
  validateIngredientForm,
} from '../src/utils/pantryValidation';

describe('Pantry Domain & Expiration Calculation', () => {
  const referenceDate = new Date(2026, 9, 21); // 21 de octubre de 2026

  it('contains supported units and categories aligned with FoodAI backend', () => {
    expect(INGREDIENT_UNITS).toContain('unidad');
    expect(INGREDIENT_UNITS).toContain('g');
    expect(INGREDIENT_UNITS).toContain('kg');
    expect(INGREDIENT_UNITS).toContain('ml');
    expect(INGREDIENT_UNITS).toContain('l');
    expect(INGREDIENT_UNITS).toContain('cucharada');
    expect(INGREDIENT_UNITS).toContain('cucharadita');
    expect(INGREDIENT_UNITS).toContain('taza');
    expect(INGREDIENT_UNITS).toContain('desconocida');

    expect(INGREDIENT_CATEGORIES).toContain('Verduras y frutas');
    expect(INGREDIENT_CATEGORIES).toContain('Carnes y proteínas');
    expect(INGREDIENT_CATEGORIES).toContain('Lácteos');
    expect(INGREDIENT_CATEGORIES).toContain('Granos y cereales');
    expect(INGREDIENT_CATEGORIES).toContain('Alacena');
    expect(INGREDIENT_CATEGORIES).toContain('Otros');
  });

  describe('getExpirationStatus()', () => {
    it('returns neutral available status when expiration date is undefined or empty without fabricating dates', () => {
      const undefinedResult = getExpirationStatus(undefined, referenceDate);
      expect(undefinedResult.isUrgent).toBe(false);
      expect(undefinedResult.daysRemaining).toBeNull();
      expect(undefinedResult.label).toBe('Disponible');
      expect(undefinedResult.badgeVariant).toBe('default');

      const emptyResult = getExpirationStatus('', referenceDate);
      expect(emptyResult.isUrgent).toBe(false);
      expect(emptyResult.daysRemaining).toBeNull();
    });

    it('returns neutral available status for malformed or nonsensical date strings without throwing', () => {
      expect(getExpirationStatus('fecha-invalida', referenceDate).daysRemaining).toBeNull();
      expect(getExpirationStatus('2026-99-99', referenceDate).daysRemaining).toBeNull();
      expect(getExpirationStatus('2026/10/25', referenceDate).daysRemaining).toBeNull();
    });

    it('identifies expired dates correctly', () => {
      // 2 días antes de la fecha de referencia
      const result = getExpirationStatus('2026-10-19', referenceDate);
      expect(result.isUrgent).toBe(true);
      expect(result.daysRemaining).toBe(-2);
      expect(result.label).toContain('Vencido');
      expect(result.badgeVariant).toBe('urgent');
    });

    it('identifies ingredients expiring today', () => {
      const result = getExpirationStatus('2026-10-21', referenceDate);
      expect(result.isUrgent).toBe(true);
      expect(result.daysRemaining).toBe(0);
      expect(result.label).toBe('Vence hoy');
      expect(result.badgeVariant).toBe('urgent');
    });

    it('identifies ingredients expiring tomorrow', () => {
      const result = getExpirationStatus('2026-10-22', referenceDate);
      expect(result.isUrgent).toBe(true);
      expect(result.daysRemaining).toBe(1);
      expect(result.label).toBe('Vence mañana');
      expect(result.badgeVariant).toBe('urgent');
    });

    it('identifies ingredients expiring within 3 days as urgent', () => {
      const result = getExpirationStatus('2026-10-24', referenceDate);
      expect(result.isUrgent).toBe(true);
      expect(result.daysRemaining).toBe(3);
      expect(result.label).toBe('Vence en 3 días');
      expect(result.badgeVariant).toBe('urgent');
    });

    it('identifies ingredients expiring between 4 and 7 days as warning', () => {
      const result = getExpirationStatus('2026-10-27', referenceDate);
      expect(result.isUrgent).toBe(false);
      expect(result.daysRemaining).toBe(6);
      expect(result.label).toContain('Consumir pronto');
      expect(result.badgeVariant).toBe('warning');
    });

    it('marks ingredients with >7 days remaining as available', () => {
      const result = getExpirationStatus('2026-11-15', referenceDate);
      expect(result.isUrgent).toBe(false);
      expect(result.daysRemaining).toBe(25);
      expect(result.label).toBe('Disponible');
      expect(result.badgeVariant).toBe('default');
    });
  });

  describe('Form Validation (validateIngredientForm)', () => {
    it('validates a complete, correct ingredient form successfully', () => {
      const result = validateIngredientForm({
        name: '  Tomates frescos  ',
        quantityText: '4.5',
        unit: 'kg',
        category: 'Verduras y frutas',
        expirationDateText: '2026-11-20',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
      expect(result.sanitizedData).toEqual({
        name: 'Tomates frescos',
        quantity: 4.5,
        unit: 'kg',
        category: 'Verduras y frutas',
        expirationDate: '2026-11-20',
      });
    });

    it('handles comma as decimal separator in quantity', () => {
      const result = validateIngredientForm({
        name: 'Pechuga de pollo',
        quantityText: '1,5',
        unit: 'kg',
        category: 'Carnes y proteínas',
      });

      expect(result.isValid).toBe(true);
      expect(result.sanitizedData?.quantity).toBe(1.5);
    });

    it('rejects empty or whitespace-only name with helpful Spanish error', () => {
      const result = validateIngredientForm({
        name: '   ',
        quantityText: '1',
        unit: 'unidad',
        category: 'Alacena',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.name).toBe('El nombre del alimento es obligatorio.');
    });

    it('rejects names shorter than 2 characters', () => {
      const result = validateIngredientForm({
        name: 'A',
        quantityText: '1',
        unit: 'unidad',
        category: 'Alacena',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.name).toBe('El nombre debe tener al menos 2 caracteres.');
    });

    it('rejects zero, negative or non-numeric quantities', () => {
      const zeroResult = validateIngredientForm({
        name: 'Arroz',
        quantityText: '0',
        unit: 'kg',
        category: 'Granos y cereales',
      });
      expect(zeroResult.isValid).toBe(false);
      expect(zeroResult.errors.quantity).toBe('La cantidad debe ser un número mayor a cero.');

      const negResult = validateIngredientForm({
        name: 'Arroz',
        quantityText: '-2',
        unit: 'kg',
        category: 'Granos y cereales',
      });
      expect(negResult.isValid).toBe(false);
      expect(negResult.errors.quantity).toBe('La cantidad debe ser un número mayor a cero.');

      const nanResult = validateIngredientForm({
        name: 'Arroz',
        quantityText: 'dos',
        unit: 'kg',
        category: 'Granos y cereales',
      });
      expect(nanResult.isValid).toBe(false);
      expect(nanResult.errors.quantity).toBe('La cantidad debe ser un número mayor a cero.');
    });

    it('validates optional expiration date format correctly', () => {
      const invalidDate = validateIngredientForm({
        name: 'Leche',
        quantityText: '1',
        unit: 'l',
        category: 'Lácteos',
        expirationDateText: '2026/10/25',
      });

      expect(invalidDate.isValid).toBe(false);
      expect(invalidDate.errors.expirationDate).toContain('formato AAAA-MM-DD');

      const nonCalendarDate = validateIngredientForm({
        name: 'Leche',
        quantityText: '1',
        unit: 'l',
        category: 'Lácteos',
        expirationDateText: '2026-02-31',
      });

      expect(nonCalendarDate.isValid).toBe(false);
      expect(nonCalendarDate.errors.expirationDate).toContain('formato AAAA-MM-DD');
    });

    it('allows omitting expiration date without validation errors', () => {
      const withoutDate = validateIngredientForm({
        name: 'Sal',
        quantityText: '500',
        unit: 'g',
        category: 'Alacena',
        expirationDateText: '',
      });

      expect(withoutDate.isValid).toBe(true);
      expect(withoutDate.sanitizedData?.expirationDate).toBeUndefined();
    });
  });

  describe('Date String Validator (isValidDateString)', () => {
    it('validates leap years correctly', () => {
      expect(isValidDateString('2024-02-29')).toBe(true);
      expect(isValidDateString('2025-02-29')).toBe(false);
    });

    it('rejects invalid year ranges', () => {
      expect(isValidDateString('1899-01-01')).toBe(false);
      expect(isValidDateString('2150-01-01')).toBe(false);
    });
  });

  // --- CORRECCIÓN 3: VALIDACIÓN ESTRICTA DE CANTIDADES (Escenario C) ---
  describe('Quantity Parser & Strict Validation (parseQuantityInput)', () => {
    it('accepts valid positive integers and decimals with dot or comma', () => {
      expect(parseQuantityInput('1')).toEqual({ ok: true, value: 1 });
      expect(parseQuantityInput('2.5')).toEqual({ ok: true, value: 2.5 });
      expect(parseQuantityInput('0,75')).toEqual({ ok: true, value: 0.75 });
      expect(parseQuantityInput('100')).toEqual({ ok: true, value: 100 });
      expect(parseQuantityInput('100000')).toEqual({ ok: true, value: 100000 });
      expect(parseQuantityInput(' 3.25 ')).toEqual({ ok: true, value: 3.25 });
    });

    it('rejects malformed and alphanumeric input (Escenario C: 2abc, 1kg, 3.5xyz)', () => {
      expect(parseQuantityInput('2abc').ok).toBe(false);
      expect(parseQuantityInput('1kg').ok).toBe(false);
      expect(parseQuantityInput('3.5xyz').ok).toBe(false);
      expect(parseQuantityInput('1.2.3').ok).toBe(false);
      expect(parseQuantityInput('Infinity').ok).toBe(false);
      expect(parseQuantityInput('-Infinity').ok).toBe(false);
      expect(parseQuantityInput('NaN').ok).toBe(false);
    });

    it('rejects zero and negative values (Escenario C: 0, -5)', () => {
      expect(parseQuantityInput('0').ok).toBe(false);
      expect(parseQuantityInput('0.0').ok).toBe(false);
      expect(parseQuantityInput('0,00').ok).toBe(false);
      expect(parseQuantityInput('-5').ok).toBe(false);
      expect(parseQuantityInput('-0.5').ok).toBe(false);
    });

    it('rejects empty input or whitespace', () => {
      expect(parseQuantityInput('').ok).toBe(false);
      expect(parseQuantityInput('   ').ok).toBe(false);
    });

    it('rejects values exceeding documented maximum limit', () => {
      expect(parseQuantityInput('100001').ok).toBe(false);
      expect(parseQuantityInput('999999').ok).toBe(false);
    });

    it('rejects excessive decimal precision (more than 3 decimal places)', () => {
      expect(parseQuantityInput('1.2345').ok).toBe(false);
    });

    it('strictly validates form submissions with invalid values (Escenario C)', () => {
      // 2abc
      const result2abc = validateIngredientForm({
        name: 'Arroz',
        quantityText: '2abc',
        unit: 'kg',
        category: 'Granos y cereales',
      });
      expect(result2abc.isValid).toBe(false);
      expect(result2abc.errors.quantity).toBe('La cantidad debe ser un número mayor a cero.');

      // 0
      const result0 = validateIngredientForm({
        name: 'Arroz',
        quantityText: '0',
        unit: 'kg',
        category: 'Granos y cereales',
      });
      expect(result0.isValid).toBe(false);
      expect(result0.errors.quantity).toBe('La cantidad debe ser un número mayor a cero.');

      // Infinity
      const resultInf = validateIngredientForm({
        name: 'Arroz',
        quantityText: 'Infinity',
        unit: 'kg',
        category: 'Granos y cereales',
      });
      expect(resultInf.isValid).toBe(false);
      expect(resultInf.errors.quantity).toBe('La cantidad debe ser un número mayor a cero.');
    });

    it('validates numeric quantities with isValidQuantityValue', () => {
      expect(isValidQuantityValue(1)).toBe(true);
      expect(isValidQuantityValue(100000)).toBe(true);
      expect(isValidQuantityValue(0.25)).toBe(true);
      expect(isValidQuantityValue(0)).toBe(false);
      expect(isValidQuantityValue(-1)).toBe(false);
      expect(isValidQuantityValue(100001)).toBe(false);
      expect(isValidQuantityValue(NaN)).toBe(false);
      expect(isValidQuantityValue(Infinity)).toBe(false);
      expect(isValidQuantityValue('10')).toBe(false);
    });
  });
});
