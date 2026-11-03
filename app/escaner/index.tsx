/**
 * FoodAI - Pantalla principal del Escáner Inteligente de Alimentos (Fase 3B).
 * Flujo completo:
 * 1. Captura con cámara o selección de galería con manejo robusto de permisos.
 * 2. Vista previa y validación previa de imagen (< 8 MB, formatos JPG/PNG/WEBP).
 * 3. Optimización automática y envío seguro a POST /api/ingredients/analyze.
 * 4. Revisión interactiva de ingredientes detectados (corrección de nombres, cantidades requeridas, categorías, unidades, duplicados).
 * 5. Guardado sincronizado en PantryContext sin persistencias duplicadas.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card, Header } from '../../src/components/common';
import { DetectedIngredientCard } from '../../src/components/scanner';
import { usePantry } from '../../src/context/PantryContext';
import {
  formatScannerDiagnostic,
  scannerApi,
  ScannerApiError,
} from '../../src/services/api/scannerApi';
import { AppColors, radius, spacing, useAppTheme, useThemeStyles, useTypography } from '../../src/theme';
import { IngredientCategory, IngredientUnit } from '../../src/types/pantry';
import {
  ScannedIngredientAction,
  ScannedIngredientItem,
  ScannerSaveSummary,
  ScannerStep,
  SelectedImage,
} from '../../src/types/scanner';
import {
  inferMimeTypeFromUri,
  prepareAndValidateImageForUpload,
  validateImageCandidate,
} from '../../src/utils/imageUtils';
import {
  areUnitsCompatibleForAddition,
  combineIngredientQuantities,
  mapDetectedToScannedItems,
} from '../../src/utils/ingredientMapper';

export default function ScannerScreen() {
  const typography = useTypography();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const { ingredients, addIngredient, updateIngredient } = usePantry();

  // Estados del flujo
  const [step, setStep] = useState<ScannerStep>('capture');
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedIngredientItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Código de diagnóstico seguro (sin tokens ni URIs) para validar fallas en dispositivo físico
  const [errorDiagnostic, setErrorDiagnostic] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [analysisProgressText, setAnalysisProgressText] = useState(
    'Preparando imagen...'
  );
  const [saveSummary, setSaveSummary] = useState<ScannerSaveSummary | null>(null);

  // Control de peticiones concurrentes, generación y cancelación
  const isMountedRef = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const activeRequestIdRef = useRef<number>(0);

  // 1. Manejador de selección de imagen
  const processSelectedAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!isMountedRef.current) return;
    setErrorMessage(null);
    setErrorDiagnostic(null);
    const mimeType = asset.mimeType || inferMimeTypeFromUri(asset.uri);
    const candidateValidation = validateImageCandidate({
      uri: asset.uri,
      mimeType,
      fileSize: asset.fileSize,
      allowOversizedForOptimization: true,
    });

    if (!candidateValidation.isValid) {
      if (!isMountedRef.current) return;
      setErrorMessage(
        candidateValidation.error ||
          'Formato de imagen no permitido. Usa JPG, PNG o WEBP.'
      );
      setStep('error');
      return;
    }

    const rawImage: SelectedImage = {
      uri: asset.uri,
      mimeType: candidateValidation.mimeType || 'image/jpeg',
      fileName: asset.fileName || `alimento_${Date.now()}.jpg`,
      fileSize: asset.fileSize,
      width: asset.width,
      height: asset.height,
    };

    if (!isMountedRef.current) return;
    setSelectedImage(rawImage);
    setStep('preview');
  };

  // Desmontaje seguro: abortar cualquier solicitud en vuelo y limpiar referencias
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      activeRequestIdRef.current += 1;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isSubmittingRef.current = false;
    };
  }, []);

  // 2. Tomar foto con la cámara
  const handleLaunchCamera = async () => {
    if (!isMountedRef.current) return;
    setErrorMessage(null);

    // En web la cámara puede no estar disponible como en un dispositivo móvil
    if (Platform.OS === 'web') {
      try {
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.85,
        });

        if (!isMountedRef.current) return;
        if (!result.canceled && result.assets && result.assets.length > 0) {
          await processSelectedAsset(result.assets[0]);
        }
      } catch {
        if (!isMountedRef.current) return;
        setErrorMessage(
          'La cámara física no está disponible directamente en este navegador. Por favor selecciona una imagen desde tus archivos o galería.'
        );
      }
      return;
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!isMountedRef.current) return;
      if (!permission.granted) {
        setErrorMessage(
          'No se otorgó permiso para acceder a la cámara. Puedes habilitarlo en los ajustes del dispositivo o elegir una imagen de tu galería.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      });

      if (!isMountedRef.current) return;
      if (!result.canceled && result.assets && result.assets.length > 0) {
        await processSelectedAsset(result.assets[0]);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al intentar abrir la cámara.'
      );
    }
  };

  // 3. Seleccionar de la galería
  const handleLaunchGallery = async () => {
    if (!isMountedRef.current) return;
    setErrorMessage(null);
    try {
      if (Platform.OS !== 'web') {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!isMountedRef.current) return;
        if (!permission.granted) {
          setErrorMessage(
            'Se requiere permiso para acceder a tus fotos. Puedes activarlo en los ajustes del sistema.'
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      });

      if (!isMountedRef.current) return;
      if (!result.canceled && result.assets && result.assets.length > 0) {
        await processSelectedAsset(result.assets[0]);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al seleccionar la imagen de la galería.'
      );
    }
  };

  // 4. Iniciar análisis con IA
  const handleStartAnalysis = async () => {
    if (!selectedImage) return;

    // Asignar un token generacional único e incremental para esta petición
    const requestId = ++activeRequestIdRef.current;

    // Abortar cualquier petición previa en vuelo
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    isSubmittingRef.current = true;

    setStep('analyzing');
    setErrorMessage(null);
    setErrorDiagnostic(null);
    setAnalysisProgressText('Verificando y optimizando imagen...');

    let analysisStage: 'prepare' | 'analyze' = 'prepare';

    try {
      // Pipeline estricto: validar formato, optimizar y comprobar tamaño final <= 8 MB
      const uploadReady = await prepareAndValidateImageForUpload(selectedImage);

      // Si la petición fue abortada o ya no es la activa, ignorar
      if (
        requestId !== activeRequestIdRef.current ||
        !isMountedRef.current ||
        controller.signal.aborted
      ) {
        return;
      }

      setAnalysisProgressText('Analizando alimentos con IA...');
      analysisStage = 'analyze';
      const detected = await scannerApi.analyzeIngredientsImage(uploadReady, {
        signal: controller.signal,
      });

      if (
        requestId !== activeRequestIdRef.current ||
        !isMountedRef.current ||
        controller.signal.aborted
      ) {
        return;
      }

      if (!detected || detected.length === 0) {
        setErrorMessage(
          'No se identificaron ingredientes claros en la imagen. Intenta tomar la foto más cerca de los alimentos o con mejor iluminación.'
        );
        setStep('error');
        return;
      }

      // Mapeo a items de revisión con detección conservadora de duplicados en la despensa
      const mapped = mapDetectedToScannedItems(detected, ingredients);

      if (
        requestId !== activeRequestIdRef.current ||
        !isMountedRef.current ||
        controller.signal.aborted
      ) {
        return;
      }

      setScannedItems(mapped);
      setStep('review');
    } catch (err) {
      // Si la petición ya no es la activa o fue cancelada deliberadamente, no mutar UI
      if (
        requestId !== activeRequestIdRef.current ||
        !isMountedRef.current ||
        controller.signal.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return;
      }

      let msg =
        'No se pudo completar el análisis de los alimentos. Intenta nuevamente.';
      let diagnostic: string | null = null;
      if (err instanceof ScannerApiError) {
        msg = err.message;
        diagnostic = formatScannerDiagnostic(err);
      } else if (err instanceof Error) {
        msg = err.message;
        // Los errores locales de validación/optimización de la imagen ocurren antes de cualquier envío
        diagnostic = analysisStage === 'prepare' ? 'IMAGE_VALIDATION_FAILED (prepare)' : null;
      }

      setErrorMessage(msg);
      setErrorDiagnostic(diagnostic);
      setStep('error');
    } finally {
      // ÚNICAMENTE la petición activa puede limpiar las referencias y el cerrojo
      if (requestId === activeRequestIdRef.current) {
        isSubmittingRef.current = false;
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    }
  };

  // Cancelar análisis en curso
  const handleCancelAnalysis = () => {
    // Incrementar el token para invalidar respuestas tardías
    activeRequestIdRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isSubmittingRef.current = false;
    setStep('preview');
  };

  // 5. Manejadores de edición en revisión
  const handleToggleSelect = (id: string) => {
    setScannedItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isSelected: !item.isSelected } : item
      )
    );
  };

  const handleChangeName = (id: string, name: string) => {
    setScannedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name } : item))
    );
  };

  const handleChangeQuantity = (id: string, quantity: number | null) => {
    setScannedItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity,
              needsReview:
                quantity === null || item.unit === 'desconocida',
            }
          : item
      )
    );
  };

  const handleChangeUnit = (id: string, unit: IngredientUnit) => {
    setScannedItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        // Si se cambia a una unidad incompatible con el duplicado de la despensa,
        // revertir de forma segura a 'create' para evitar sumas corruptas.
        let nextAction = item.action;
        if (item.duplicateMatch && item.action === 'add_to_existing') {
          if (!areUnitsCompatibleForAddition(item.duplicateMatch.unit, unit)) {
            nextAction = 'create';
          }
        }

        return {
          ...item,
          unit,
          action: nextAction,
          needsReview:
            item.quantity === null || unit === 'desconocida',
        };
      })
    );
  };

  const handleChangeCategory = (id: string, category: IngredientCategory) => {
    setScannedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, category } : item))
    );
  };

  const handleChangeAction = (id: string, action: ScannedIngredientAction) => {
    setScannedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, action } : item))
    );
  };

  const handleRemoveItem = (id: string) => {
    setScannedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSelectAll = (select: boolean) => {
    setScannedItems((prev) =>
      prev.map((item) => ({ ...item, isSelected: select }))
    );
  };

  // 6. Guardar ingredientes confirmados en PantryContext con protección de concurrencia y conversiones seguras
  const handleConfirmAndSave = async () => {
    if (!canSave || isSubmittingRef.current) return;

    try {
      isSubmittingRef.current = true;
      setIsSaving(true);
      setStep('saving');
      setErrorMessage(null);

      let savedCount = 0;
      let updatedCount = 0;
      let failedCount = 0;
      const failedNames: string[] = [];

      // Mapa acumulativo en memoria para rastrear el inventario confirmado y prevenir "lost updates"
      // si múltiples alimentos detectados corresponden al mismo registro en la despensa.
      const runningPantry = new Map<
        string,
        { quantity: number; unit: IngredientUnit; name: string }
      >();
      for (const ing of ingredients) {
        runningPantry.set(ing.id, {
          quantity: ing.quantity,
          unit: ing.unit,
          name: ing.name,
        });
      }

      for (const item of selectedItems) {
        try {
          if (
            item.action === 'add_to_existing' &&
            item.duplicateMatch &&
            typeof item.quantity === 'number'
          ) {
            const targetId =
              item.duplicateMatch.pantryIngredientId ||
              (item.duplicateMatch as unknown as { id: string }).id;
            const currentRecord = runningPantry.get(targetId);

            if (currentRecord) {
              const combined = combineIngredientQuantities(
                currentRecord.quantity,
                currentRecord.unit,
                item.quantity,
                item.unit
              );

              if (combined.success) {
                await updateIngredient({
                  id: targetId,
                  quantity: combined.newQuantity,
                  unit: combined.unit,
                });
                runningPantry.set(targetId, {
                  ...currentRecord,
                  quantity: combined.newQuantity,
                  unit: combined.unit,
                });
                updatedCount += 1;
              } else {
                // Si las unidades no son compatibles, NUNCA sumar silenciosamente.
                // Guardar como ítem separado para garantizar la fidelidad del inventario.
                await addIngredient({
                  name: item.name.trim(),
                  quantity: item.quantity,
                  unit: item.unit,
                  category: item.category,
                });
                savedCount += 1;
              }
            } else {
              // Si no se encuentra en el mapa, agregarlo como nuevo
              await addIngredient({
                name: item.name.trim(),
                quantity: item.quantity,
                unit: item.unit,
                category: item.category,
              });
              savedCount += 1;
            }
          } else {
            // Agregar nuevo ingrediente confirmado
            if (typeof item.quantity === 'number') {
              await addIngredient({
                name: item.name.trim(),
                quantity: item.quantity,
                unit: item.unit,
                category: item.category,
              });
              savedCount += 1;
            }
          }
        } catch {
          failedCount += 1;
          failedNames.push(item.name);
        }
      }

      setSaveSummary({
        savedCount,
        updatedCount,
        failedCount,
        failedNames,
      });
      setStep('completed');
    } catch {
      setErrorMessage(
        'Ocurrió un error inesperado al guardar los alimentos en tu despensa.'
      );
      setStep('error');
    } finally {
      setIsSaving(false);
      isSubmittingRef.current = false;
    }
  };

  const handleResetScanner = () => {
    activeRequestIdRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isSubmittingRef.current = false;
    setSelectedImage(null);
    setScannedItems([]);
    setErrorMessage(null);
    setSaveSummary(null);
    setStep('capture');
  };

  // Cálculos de revisión
  const selectedItems = scannedItems.filter((i) => i.isSelected);
  const itemsWithMissingQuantity = selectedItems.filter(
    (i) => i.quantity === null || i.quantity <= 0
  );
  const canSave =
    selectedItems.length > 0 && itemsWithMissingQuantity.length === 0 && !isSaving;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header unificado */}
      <Header
        elevated
        title="Escáner Inteligente"
        subtitle="Detecta ingredientes con tu cámara e IA"
        showBack
        onBack={() => {
          if (step === 'review' || step === 'preview' || step === 'error') {
            handleResetScanner();
          } else {
            router.back();
          }
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Banner general de error */}
        {errorMessage && step !== 'error' && (
          <View style={styles.errorBanner} testID="scanner-top-error-banner">
            <MaterialIcons name="error-outline" size={20} color={colors.error} />
            <Text style={[styles.errorBannerText, typography.bodySm]}>
              {errorMessage}
            </Text>
            <Pressable
              onPress={() => setErrorMessage(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="close" size={16} color={colors.error} />
            </Pressable>
          </View>
        )}

        {/* =========================================================================
            ESTADO 1: CAPTURA INICIAL
           ========================================================================= */}
        {step === 'capture' && (
          <View style={styles.captureContainer} testID="scanner-capture-state">
            <Card variant="elevated" style={styles.viewfinderCard}>
              <View style={styles.viewfinderBox}>
                <Image
                  source={require('../../assets/images/scanner-viewfinder.jpg')}
                  style={styles.viewfinderImage}
                  resizeMode="cover"
                  accessibilityLabel="Visor de escáner con ingredientes sobre la mesa"
                />
                <View style={styles.viewfinderReticleOverlay}>
                  <View
                    style={styles.viewfinderFrame}
                    pointerEvents="none"
                    accessible={false}
                    importantForAccessibility="no-hide-descendants"
                  >
                    <View style={[styles.viewfinderCorner, styles.cornerTopLeft]} />
                    <View style={[styles.viewfinderCorner, styles.cornerTopRight]} />
                    <View style={[styles.viewfinderCorner, styles.cornerBottomLeft]} />
                    <View style={[styles.viewfinderCorner, styles.cornerBottomRight]} />
                  </View>
                  <View style={styles.viewfinderReticle}>
                    <MaterialIcons
                      name="photo-camera"
                      size={36}
                      color={colors.primary}
                    />
                  </View>
                  <Text
                    style={[
                      styles.viewfinderReticleText,
                      typography.labelMd,
                    ]}
                  >
                    Centra tus alimentos
                  </Text>
                </View>
              </View>

              <View style={styles.captureActions}>
                <Button
                  testID="scanner-take-photo-button"
                  title="Tomar foto"
                  variant="primary"
                  size="lg"
                  fullWidth
                  onPress={() => { void handleLaunchCamera(); }}
                  accessibilityLabel="Tomar fotografía con la cámara"
                  leftIcon={
                    <MaterialIcons
                      name="add-a-photo"
                      size={20}
                      color={colors.onPrimary}
                    />
                  }
                />

                <Button
                  testID="scanner-gallery-button"
                  title="Elegir de la galería"
                  variant="outline"
                  size="md"
                  fullWidth
                  onPress={() => { void handleLaunchGallery(); }}
                  accessibilityLabel="Seleccionar fotografía de la galería"
                  leftIcon={
                    <MaterialIcons
                      name="photo-library"
                      size={20}
                      color={colors.primary}
                    />
                  }
                />
              </View>
            </Card>

            {/* Consejos para una buena captura */}
            <Card variant="flat" style={styles.tipsCard}>
              <View style={styles.tipsHeaderRow}>
                <View style={styles.tipsIconCircle}>
                  <MaterialIcons name="lightbulb" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.tipsTitle, typography.headlineMd]}>
                  Consejos para una detección óptima
                </Text>
              </View>
              <View style={styles.tipItem}>
                <MaterialIcons
                  name="check-circle"
                  size={16}
                  color={colors.primary}
                />
                <Text style={[styles.tipText, typography.bodySm]}>
                  Coloca los alimentos sobre una superficie despejada y con buena iluminación.
                </Text>
              </View>
              <View style={styles.tipItem}>
                <MaterialIcons
                  name="check-circle"
                  size={16}
                  color={colors.primary}
                />
                <Text style={[styles.tipText, typography.bodySm]}>
                  Evita que se superpongan o queden cubiertos por bolsas oscuras.
                </Text>
              </View>
              <View style={styles.tipItem}>
                <MaterialIcons
                  name="check-circle"
                  size={16}
                  color={colors.primary}
                />
                <Text style={[styles.tipText, typography.bodySm]}>
                  Siempre podrás editar las cantidades o corregir los nombres antes de guardar.
                </Text>
              </View>
            </Card>
          </View>
        )}

        {/* =========================================================================
            ESTADO 2: VISTA PREVIA DE IMAGEN
           ========================================================================= */}
        {step === 'preview' && selectedImage && (
          <View style={styles.previewContainer} testID="scanner-preview-state">
            <Card variant="elevated" style={styles.previewCard}>
              <View style={styles.previewImageBox}>
                <Image
                  source={{ uri: selectedImage.uri }}
                  style={styles.previewImage}
                  resizeMode="cover"
                  accessibilityLabel="Vista previa de la fotografía seleccionada"
                />
              </View>

              <View style={styles.previewInfo}>
                <View style={styles.previewBadgeRow}>
                  <MaterialIcons name="check" size={16} color={colors.primary} />
                  <Text style={[styles.previewBadgeText, typography.labelSm]}>
                    Foto lista para analizar
                  </Text>
                </View>
                <Text style={[styles.previewDesc, typography.bodySm]}>
                  Al presionar «Analizar alimentos», Gemini identificará los alimentos visibles.
                </Text>
              </View>

              <View style={styles.previewButtonsRow}>
                <Button
                  testID="scanner-analyze-button"
                  title="Analizar alimentos"
                  variant="primary"
                  size="lg"
                  fullWidth
                  onPress={() => { void handleStartAnalysis(); }}
                  leftIcon={
                    <MaterialIcons
                      name="auto-awesome"
                      size={20}
                      color={colors.onPrimary}
                    />
                  }
                  accessibilityLabel="Analizar alimentos de la imagen con inteligencia artificial"
                />

                <View style={styles.secondaryButtonsRow}>
                  <Button
                    testID="scanner-retake-button"
                    title="Cambiar foto"
                    variant="outline"
                    size="md"
                    style={{ flex: 1 }}
                    onPress={() => { void handleLaunchGallery(); }}
                    accessibilityLabel="Cambiar fotografía seleccionada"
                  />
                  <Button
                    testID="scanner-cancel-preview-button"
                    title="Cancelar"
                    variant="ghost"
                    size="md"
                    style={{ flex: 1 }}
                    onPress={handleResetScanner}
                    accessibilityLabel="Cancelar y volver a la captura"
                  />
                </View>
              </View>
            </Card>
          </View>
        )}

        {/* =========================================================================
            ESTADO 3: ANALIZANDO CON IA
           ========================================================================= */}
        {step === 'analyzing' && (
          <View style={styles.analyzingContainer} testID="scanner-analyzing-state">
            <Card variant="elevated" style={styles.analyzingCard}>
              <View style={styles.analyzingSpinnerBox}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>

              <Text style={[styles.analyzingTitle, typography.headlineMd]}>
                Reconociendo alimentos
              </Text>

              <Text style={[styles.analyzingProgress, typography.bodyMd]}>
                {analysisProgressText}
              </Text>

              <Text style={[styles.analyzingSubtext, typography.bodySm]}>
                Esto suele tardar unos segundos. Por favor no cierres la aplicación.
              </Text>

              <Button
                testID="scanner-abort-button"
                title="Cancelar análisis"
                variant="outline"
                size="sm"
                onPress={handleCancelAnalysis}
                accessibilityLabel="Cancelar análisis en curso"
              />
            </Card>
          </View>
        )}

        {/* =========================================================================
            ESTADO 4: REVISIÓN Y CONFIRMACIÓN DE INGREDIENTES
           ========================================================================= */}
        {step === 'review' && (
          <View style={styles.reviewContainer} testID="scanner-review-state">
            {/* Header informativo */}
            <View style={styles.reviewTopSummary}>
              <View>
                <Text style={[styles.reviewHeading, typography.headlineMd]}>
                  {scannedItems.length} alimento{scannedItems.length === 1 ? '' : 's'} detectado{scannedItems.length === 1 ? '' : 's'}
                </Text>
                <Text style={[styles.reviewSubheading, typography.bodySm]}>
                  Revisa y corrige los datos antes de guardarlos.
                </Text>
              </View>

              <View style={styles.selectToggleRow}>
                <Pressable
                  testID="scanner-select-all-button"
                  onPress={() => handleSelectAll(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.toggleText, typography.labelSm]}>
                    Todos
                  </Text>
                </Pressable>
                <Text style={styles.toggleDivider}>|</Text>
                <Pressable
                  testID="scanner-deselect-all-button"
                  onPress={() => handleSelectAll(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.toggleText, typography.labelSm]}>
                    Ninguno
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Aviso si faltan cantidades */}
            {itemsWithMissingQuantity.length > 0 && (
              <View
                style={styles.missingQuantityBanner}
                testID="scanner-missing-quantity-notice"
              >
                <MaterialIcons name="warning" size={18} color={colors.onErrorContainer} />
                <Text style={[styles.missingQuantityText, typography.bodySm]}>
                  Hay {itemsWithMissingQuantity.length} alimento{itemsWithMissingQuantity.length === 1 ? '' : 's'} sin cantidad definida. Ingresa un número positivo en cada uno para poder guardarlo.
                </Text>
              </View>
            )}

            {/* Lista de tarjetas interactivas */}
            <View style={styles.cardsList}>
              {scannedItems.map((item) => (
                <DetectedIngredientCard
                  key={item.id}
                  item={item}
                  onToggleSelect={handleToggleSelect}
                  onChangeName={handleChangeName}
                  onChangeQuantity={handleChangeQuantity}
                  onChangeUnit={handleChangeUnit}
                  onChangeCategory={handleChangeCategory}
                  onChangeAction={handleChangeAction}
                  onRemove={handleRemoveItem}
                />
              ))}
            </View>

            {/* Acciones de guardado */}
            <View style={styles.reviewBottomActions}>
              <Button
                testID="scanner-confirm-save-button"
                title={
                  selectedItems.length === 0
                    ? 'Selecciona al menos un alimento'
                    : itemsWithMissingQuantity.length > 0
                    ? 'Define las cantidades pendientes'
                    : `Guardar ${selectedItems.length} alimento${selectedItems.length === 1 ? '' : 's'} en mi despensa`
                }
                variant="primary"
                size="lg"
                fullWidth
                disabled={!canSave}
                onPress={() => { void handleConfirmAndSave(); }}
                leftIcon={
                  <MaterialIcons
                    name="save"
                    size={20}
                    color={colors.onPrimary}
                  />
                }
                accessibilityLabel="Confirmar y guardar alimentos seleccionados en mi despensa"
              />

              <Button
                testID="scanner-retake-from-review-button"
                title="Descartar y tomar otra foto"
                variant="outline"
                size="md"
                fullWidth
                onPress={handleResetScanner}
                accessibilityLabel="Descartar detecciones y tomar otra foto"
              />
            </View>
          </View>
        )}

        {/* =========================================================================
            ESTADO 5: GUARDANDO EN DESPENSA
           ========================================================================= */}
        {step === 'saving' && (
          <View style={styles.analyzingContainer} testID="scanner-saving-state">
            <Card variant="elevated" style={styles.analyzingCard}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.analyzingTitle, typography.headlineMd]}>
                Guardando en tu despensa
              </Text>
              <Text style={[styles.analyzingProgress, typography.bodyMd]}>
                Sincronizando alimentos con tu despensa local...
              </Text>
            </Card>
          </View>
        )}

        {/* =========================================================================
            ESTADO 6: COMPLETADO CON ÉXITO
           ========================================================================= */}
        {step === 'completed' && saveSummary && (
          <View style={styles.completedContainer} testID="scanner-completed-state">
            <Card variant="elevated" style={styles.completedCard}>
              <View style={styles.successIconBox}>
                <MaterialIcons name="check-circle" size={54} color={colors.success} />
              </View>

              <Text style={[styles.completedTitle, typography.headlineMd]}>
                ¡Alimentos guardados con éxito!
              </Text>

              <Text style={[styles.completedDesc, typography.bodyMd]}>
                Tus ingredientes confirmados ya están sincronizados con tu despensa y listos para recomendar recetas.
              </Text>

              <View style={styles.summaryStatsBox}>
                {saveSummary.savedCount > 0 && (
                  <View style={styles.statRow}>
                    <MaterialIcons name="add-circle" size={18} color={colors.primary} />
                    <Text style={[styles.statText, typography.bodyMd]}>
                      <Text style={{ fontWeight: '700' }}>{saveSummary.savedCount}</Text> alimento{saveSummary.savedCount === 1 ? '' : 's'} nuevo{saveSummary.savedCount === 1 ? '' : 's'} agregado{saveSummary.savedCount === 1 ? '' : 's'}.
                    </Text>
                  </View>
                )}

                {saveSummary.updatedCount > 0 && (
                  <View style={styles.statRow}>
                    <MaterialIcons name="sync" size={18} color={colors.tertiary} />
                    <Text style={[styles.statText, typography.bodyMd]}>
                      <Text style={{ fontWeight: '700' }}>{saveSummary.updatedCount}</Text> alimento{saveSummary.updatedCount === 1 ? '' : 's'} existente{saveSummary.updatedCount === 1 ? '' : 's'} actualizado{saveSummary.updatedCount === 1 ? '' : 's'}.
                    </Text>
                  </View>
                )}

                {saveSummary.failedCount > 0 && (
                  <View style={styles.statRow}>
                    <MaterialIcons name="error" size={18} color={colors.error} />
                    <Text style={[styles.statText, typography.bodySm, { color: colors.error }]}>
                      {saveSummary.failedCount} no se pudieron guardar ({saveSummary.failedNames.join(', ')}).
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.completedButtons}>
                <Button
                  testID="scanner-go-to-pantry-button"
                  title="Ver Mi Despensa"
                  variant="primary"
                  size="lg"
                  fullWidth
                  onPress={() => router.replace('/(tabs)/despensa')}
                  leftIcon={
                    <MaterialIcons
                      name="kitchen"
                      size={20}
                      color={colors.onPrimary}
                    />
                  }
                  accessibilityLabel="Ir a la pantalla de Mi Despensa"
                />

                <Button
                  testID="scanner-scan-again-button"
                  title="Escanear más alimentos"
                  variant="outline"
                  size="md"
                  fullWidth
                  onPress={handleResetScanner}
                  leftIcon={
                    <MaterialIcons
                      name="photo-camera"
                      size={20}
                      color={colors.primary}
                    />
                  }
                  accessibilityLabel="Escanear más alimentos con la cámara"
                />

                <Button
                  testID="scanner-go-home-button"
                  title="Volver al Inicio"
                  variant="ghost"
                  size="md"
                  fullWidth
                  onPress={() => router.replace('/(tabs)')}
                  accessibilityLabel="Volver a la pantalla de Inicio"
                />
              </View>
            </Card>
          </View>
        )}

        {/* =========================================================================
            ESTADO 7: ERROR CON OPCIONES DE REINTENTO
           ========================================================================= */}
        {step === 'error' && (
          <View style={styles.errorStateContainer} testID="scanner-error-state">
            <Card variant="outlined" style={styles.errorStateCard}>
              <View style={styles.errorIconBox}>
                <MaterialIcons name="error-outline" size={48} color={colors.error} />
              </View>

              <Text style={[styles.errorStateTitle, typography.headlineMd]}>
                No pudimos procesar la imagen
              </Text>

              <Text style={[styles.errorStateDesc, typography.bodyMd]}>
                {errorMessage ||
                  'Ocurrió un problema de comunicación o la imagen no pudo ser interpretada correctamente por el servidor de IA.'}
              </Text>

              {errorDiagnostic && (
                <Text
                  testID="scanner-error-diagnostic"
                  style={[styles.errorStateDiagnostic, typography.labelSm]}
                >
                  Código de diagnóstico: {errorDiagnostic}
                </Text>
              )}

              <View style={styles.errorStateButtons}>
                {selectedImage && (
                  <Button
                    testID="scanner-retry-analysis-button"
                    title="Reintentar análisis"
                    variant="primary"
                    size="lg"
                    fullWidth
                    onPress={() => { void handleStartAnalysis(); }}
                    leftIcon={
                      <MaterialIcons
                        name="refresh"
                        size={20}
                        color={colors.onPrimary}
                      />
                    }
                  />
                )}

                <Button
                  testID="scanner-retry-pick-button"
                  title="Tomar o elegir otra foto"
                  variant="outline"
                  size="md"
                  fullWidth
                  onPress={handleResetScanner}
                  leftIcon={
                    <MaterialIcons
                      name="photo-camera"
                      size={20}
                      color={colors.primary}
                    />
                  }
                />

                <Button
                  testID="scanner-cancel-error-button"
                  title="Cancelar y volver"
                  variant="ghost"
                  size="md"
                  fullWidth
                  onPress={() => router.back()}
                />
              </View>
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.canvas,
    },
    scrollContent: {
      padding: spacing.margin,
      paddingBottom: spacing.xxl + 20,
      gap: spacing.md,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.errorContainer,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.error,
    },
    errorBannerText: {
      color: colors.onErrorContainer,
      flex: 1,
    },
    captureContainer: {
      gap: spacing.md,
    },
    viewfinderCard: {
      backgroundColor: colors.surface,
      padding: spacing.md,
      gap: spacing.md,
    },
    viewfinderBox: {
      width: '100%',
      height: 300,
      borderRadius: radius.lg + 4,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: '#1C1C19',
    },
    viewfinderImage: {
      width: '100%',
      height: '100%',
      opacity: 0.9,
    },
    viewfinderReticleOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(28, 28, 25, 0.38)',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    viewfinderReticle: {
      width: 72,
      height: 72,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      borderWidth: 6,
      borderColor: 'rgba(255, 255, 255, 0.4)',
    },
    viewfinderReticleText: {
      color: '#FFFFFF',
      fontWeight: '700',
      textShadowColor: 'rgba(0, 0, 0, 0.75)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    captureActions: {
      gap: spacing.xs,
    },
    viewfinderFrame: {
      position: 'absolute',
      top: '12%',
      bottom: '12%',
      left: '9%',
      right: '9%',
    },
    viewfinderCorner: {
      position: 'absolute',
      width: 30,
      height: 30,
      borderColor: 'rgba(252, 249, 244, 0.92)',
    },
    cornerTopLeft: {
      top: 0,
      left: 0,
      borderTopWidth: 3,
      borderLeftWidth: 3,
      borderTopLeftRadius: 14,
    },
    cornerTopRight: {
      top: 0,
      right: 0,
      borderTopWidth: 3,
      borderRightWidth: 3,
      borderTopRightRadius: 14,
    },
    cornerBottomLeft: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
      borderBottomLeftRadius: 14,
    },
    cornerBottomRight: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 3,
      borderRightWidth: 3,
      borderBottomRightRadius: 14,
    },
    tipsIconCircle: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      backgroundColor: colors.primaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tipsCard: {
      backgroundColor: colors.surfaceContainerLow,
      padding: spacing.md,
      gap: spacing.sm,
    },
    tipsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    tipsTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    tipItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
    },
    tipText: {
      color: colors.textSecondary,
      flex: 1,
      lineHeight: 18,
    },
    previewContainer: {
      gap: spacing.md,
    },
    previewCard: {
      backgroundColor: colors.surface,
      padding: spacing.md,
      gap: spacing.md,
    },
    previewImageBox: {
      width: '100%',
      height: 260,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceContainerLow,
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    previewInfo: {
      gap: 4,
    },
    previewBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    previewBadgeText: {
      color: colors.primary,
      fontWeight: '700',
    },
    previewDesc: {
      color: colors.textSecondary,
    },
    previewButtonsRow: {
      gap: spacing.xs,
    },
    secondaryButtonsRow: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    analyzingContainer: {
      paddingVertical: spacing.xl,
    },
    analyzingCard: {
      backgroundColor: colors.surface,
      padding: spacing.xl,
      alignItems: 'center',
      gap: spacing.md,
    },
    analyzingSpinnerBox: {
      width: 68,
      height: 68,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceContainerLow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    analyzingTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
      textAlign: 'center',
    },
    analyzingProgress: {
      color: colors.primary,
      fontWeight: '600',
      textAlign: 'center',
    },
    analyzingSubtext: {
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 280,
    },
    reviewContainer: {
      gap: spacing.md,
    },
    reviewTopSummary: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    reviewHeading: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    reviewSubheading: {
      color: colors.textSecondary,
    },
    selectToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    toggleText: {
      color: colors.primary,
      fontWeight: '700',
    },
    toggleDivider: {
      color: colors.outline,
    },
    missingQuantityBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.errorContainer,
      padding: spacing.sm,
      borderRadius: radius.md,
    },
    missingQuantityText: {
      color: colors.onErrorContainer,
      flex: 1,
      lineHeight: 18,
    },
    cardsList: {
      gap: spacing.sm,
    },
    reviewBottomActions: {
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    completedContainer: {
      paddingVertical: spacing.lg,
    },
    completedCard: {
      backgroundColor: colors.surface,
      padding: spacing.xl,
      alignItems: 'center',
      gap: spacing.md,
    },
    successIconBox: {
      marginBottom: spacing.xs,
    },
    completedTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
      textAlign: 'center',
    },
    completedDesc: {
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    summaryStatsBox: {
      width: '100%',
      backgroundColor: colors.surfaceContainerLow,
      padding: spacing.md,
      borderRadius: radius.md,
      gap: spacing.xs,
    },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    statText: {
      color: colors.textPrimary,
      flex: 1,
    },
    completedButtons: {
      width: '100%',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    errorStateContainer: {
      paddingVertical: spacing.lg,
    },
    errorStateCard: {
      backgroundColor: colors.surface,
      padding: spacing.xl,
      alignItems: 'center',
      gap: spacing.md,
      borderColor: colors.error,
    },
    errorIconBox: {
      marginBottom: spacing.xs,
    },
    errorStateTitle: {
      color: colors.error,
      fontWeight: '700',
      textAlign: 'center',
    },
    errorStateDesc: {
      color: colors.textPrimary,
      textAlign: 'center',
      lineHeight: 22,
    },
    errorStateDiagnostic: {
      color: colors.textSecondary,
      textAlign: 'center',
    },
    errorStateButtons: {
      width: '100%',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
  });
