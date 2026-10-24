/**
 * FoodAI - Tipos y modelos para el escáner inteligente de ingredientes (Fase 3B).
 */
import { IngredientCategory, IngredientUnit } from './pantry';

export type BackendIngredientUnit =
  | 'unidad'
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'desconocida';

export interface BackendDetectedIngredient {
  name: string;
  quantity: number | null;
  unit: BackendIngredientUnit;
  needsReview: boolean;
}

export interface BackendAnalyzeResponse {
  success: boolean;
  data: {
    ingredients: BackendDetectedIngredient[];
  };
}

export interface SelectedImage {
  uri: string;
  mimeType: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
}

export type ScannedIngredientAction = 'create' | 'add_to_existing';

export type DuplicateMatchType = 'exact' | 'possible';

export interface DuplicatePantryMatch {
  id: string;
  pantryIngredientId?: string;
  name: string;
  currentQuantity: number;
  unit: IngredientUnit;
  category: IngredientCategory;
  matchType?: DuplicateMatchType;
}

export interface ScannedIngredientItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: IngredientUnit;
  category: IngredientCategory;
  needsReview: boolean;
  isSelected: boolean;
  duplicateMatch?: DuplicatePantryMatch;
  action: ScannedIngredientAction;
}

export type ScannerStep =
  | 'capture'
  | 'preview'
  | 'analyzing'
  | 'review'
  | 'saving'
  | 'completed'
  | 'error';

export interface ScannerSaveSummary {
  savedCount: number;
  updatedCount: number;
  failedCount: number;
  failedNames: string[];
}
