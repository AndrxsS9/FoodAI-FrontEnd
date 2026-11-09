/**
 * Fase 28C-A — LocaleContext: idioma predeterminado, selección reactiva, persistencia,
 * fallos de almacenamiento, cambios rápidos y aislamiento respecto de otros proveedores.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LOCALE_HYDRATION_TIMEOUT_MS,
  LocaleProvider,
  useLocale,
} from '../src/context/LocaleContext';
import { ThemeProvider, useAppTheme } from '../src/context/ThemeContext';
import {
  AsyncStorageLocaleStorageAdapter,
  LOCALE_STORAGE_KEY,
  Locale,
  LocaleStorageAdapter,
  LocaleStorageError,
} from '../src/services/storage/localeStorage';

class MemoryLocaleAdapter implements LocaleStorageAdapter {
  stored: Locale | null;
  saves: Locale[] = [];
  failNextSave = false;
  failLoad = false;
  loadDelayMs = 0;
  saveDelayMs = 0;

  constructor(initial: Locale | null = null) {
    this.stored = initial;
  }

  async getLocale(): Promise<Locale | null> {
    if (this.loadDelayMs) await new Promise((r) => setTimeout(r, this.loadDelayMs));
    if (this.failLoad) throw new LocaleStorageError('load_failed', 'No se pudo leer.');
    return this.stored;
  }

  async saveLocale(locale: Locale): Promise<void> {
    if (this.saveDelayMs) await new Promise((r) => setTimeout(r, this.saveDelayMs));
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new LocaleStorageError('save_failed', 'No se pudo guardar.');
    }
    this.saves.push(locale);
    this.stored = locale;
  }

  async clearLocale(): Promise<void> {
    this.stored = null;
  }
}

let latest: ReturnType<typeof useLocale> | null = null;

function Probe() {
  const value = useLocale();
  latest = value;
  return (
    <View>
      <Text testID="locale">{value.locale}</Text>
      <Text testID="loaded">{String(value.isLoaded)}</Text>
      <Text testID="tab">{value.t('tabs.home')}</Text>
      <Text testID="plural">{value.tp('people', 2)}</Text>
      <Text testID="currency">{value.format.currency(25000)}</Text>
      <Text testID="storage-error">{value.storageError ?? 'none'}</Text>
    </View>
  );
}

describe('Fase 28C-A · LocaleContext', () => {
  beforeEach(async () => {
    latest = null;
    await AsyncStorage.clear();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  it('sin proveedor, los componentes reciben español (compatibilidad total)', async () => {
    const { getByTestId } = await render(<Probe />);
    expect(getByTestId('locale').props.children).toBe('es');
    expect(getByTestId('tab').props.children).toBe('Inicio');
    expect(getByTestId('plural').props.children).toBe('2 personas');
    expect(getByTestId('currency').props.children).toBe('$25.000 COP');
  });

  it('un usuario existente sin preferencia guardada sigue viendo español', async () => {
    const adapter = new MemoryLocaleAdapter(null);
    const { getByTestId } = await render(
      <LocaleProvider storageAdapter={adapter}>
        <Probe />
      </LocaleProvider>
    );
    await waitFor(() => expect(getByTestId('loaded').props.children).toBe('true'));
    expect(getByTestId('locale').props.children).toBe('es');
    expect(getByTestId('tab').props.children).toBe('Inicio');
    expect(adapter.saves).toEqual([]);
  });

  it('hidrata el inglés guardado y lo aplica a traducciones y formatos', async () => {
    const adapter = new MemoryLocaleAdapter('en');
    const { getByTestId } = await render(
      <LocaleProvider storageAdapter={adapter}>
        <Probe />
      </LocaleProvider>
    );
    await waitFor(() => expect(getByTestId('locale').props.children).toBe('en'));
    expect(getByTestId('tab').props.children).toBe('Home');
    expect(getByTestId('plural').props.children).toBe('2 people');
    expect(getByTestId('currency').props.children).toBe('$25,000 COP');
  });

  it('seleccionar inglés es reactivo inmediato y se persiste', async () => {
    const adapter = new MemoryLocaleAdapter(null);
    const { getByTestId } = await render(
      <LocaleProvider storageAdapter={adapter}>
        <Probe />
      </LocaleProvider>
    );
    await waitFor(() => expect(getByTestId('loaded').props.children).toBe('true'));

    await act(async () => {
      await latest!.setLocale('en');
    });
    expect(getByTestId('locale').props.children).toBe('en');
    expect(getByTestId('tab').props.children).toBe('Home');
    expect(adapter.saves).toEqual(['en']);
    expect(getByTestId('storage-error').props.children).toBe('none');
  });

  it('la preferencia sobrevive a un remontaje con almacenamiento real (AsyncStorage)', async () => {
    const first = await render(
      <LocaleProvider storageAdapter={new AsyncStorageLocaleStorageAdapter()}>
        <Probe />
      </LocaleProvider>
    );
    await waitFor(() => expect(first.getByTestId('loaded').props.children).toBe('true'));
    await act(async () => {
      await latest!.setLocale('en');
    });
    first.unmount();

    expect(JSON.parse((await AsyncStorage.getItem(LOCALE_STORAGE_KEY))!).locale).toBe('en');

    const second = await render(
      <LocaleProvider storageAdapter={new AsyncStorageLocaleStorageAdapter()}>
        <Probe />
      </LocaleProvider>
    );
    await waitFor(() => expect(second.getByTestId('locale').props.children).toBe('en'));
    expect(second.getByTestId('tab').props.children).toBe('Home');
  });

  it('un fallo al guardar se reporta con código, rechaza la promesa y no finge éxito', async () => {
    const adapter = new MemoryLocaleAdapter(null);
    adapter.failNextSave = true;
    const { getByTestId } = await render(
      <LocaleProvider storageAdapter={adapter}>
        <Probe />
      </LocaleProvider>
    );
    await waitFor(() => expect(getByTestId('loaded').props.children).toBe('true'));

    let rejection: unknown = null;
    await act(async () => {
      rejection = await latest!.setLocale('en').catch((e) => e);
    });
    expect(rejection).toBeInstanceOf(LocaleStorageError);
    expect(getByTestId('storage-error').props.children).toBe('save_failed');
    // El idioma se aplicó en memoria (sesión actual) pero no quedó persistido
    expect(getByTestId('locale').props.children).toBe('en');
    expect(adapter.stored).toBeNull();

    await act(async () => latest!.clearStorageError());
    expect(getByTestId('storage-error').props.children).toBe('none');
  });

  it('un fallo de lectura usa español y expone load_failed', async () => {
    const adapter = new MemoryLocaleAdapter('en');
    adapter.failLoad = true;
    const { getByTestId } = await render(
      <LocaleProvider storageAdapter={adapter}>
        <Probe />
      </LocaleProvider>
    );
    await waitFor(() => expect(getByTestId('loaded').props.children).toBe('true'));
    expect(getByTestId('locale').props.children).toBe('es');
    expect(getByTestId('storage-error').props.children).toBe('load_failed');
  });

  it('un almacenamiento que no responde no bloquea el arranque (tiempo límite)', async () => {
    jest.useFakeTimers();
    const adapter: LocaleStorageAdapter = {
      getLocale: () => new Promise(() => {}),
      saveLocale: async () => {},
      clearLocale: async () => {},
    };
    const { getByTestId } = await render(
      <LocaleProvider storageAdapter={adapter}>
        <Probe />
      </LocaleProvider>
    );
    expect(getByTestId('loaded').props.children).toBe('false');
    await act(async () => {
      jest.advanceTimersByTime(LOCALE_HYDRATION_TIMEOUT_MS + 10);
    });
    expect(getByTestId('loaded').props.children).toBe('true');
    expect(getByTestId('locale').props.children).toBe('es');
  });

  it('cambios rápidos: gana la última elección en memoria y en almacenamiento', async () => {
    const adapter = new MemoryLocaleAdapter(null);
    adapter.saveDelayMs = 10;
    const { getByTestId } = await render(
      <LocaleProvider storageAdapter={adapter}>
        <Probe />
      </LocaleProvider>
    );
    await waitFor(() => expect(getByTestId('loaded').props.children).toBe('true'));

    await act(async () => {
      await Promise.allSettled([
        latest!.setLocale('en'),
        latest!.setLocale('es'),
        latest!.setLocale('en'),
        latest!.setLocale('es'),
      ]);
    });
    expect(getByTestId('locale').props.children).toBe('es');
    expect(adapter.stored).toBe('es');
    expect(adapter.saves[adapter.saves.length - 1]).toBe('es');
  });

  it('una hidratación lenta nunca pisa una selección hecha por el usuario', async () => {
    const adapter = new MemoryLocaleAdapter('en');
    adapter.loadDelayMs = 30;
    const { getByTestId } = await render(
      <LocaleProvider storageAdapter={adapter}>
        <Probe />
      </LocaleProvider>
    );
    // El usuario elige español antes de que termine la lectura del valor guardado («en»)
    await act(async () => {
      await latest!.setLocale('es');
    });
    await waitFor(() => expect(getByTestId('loaded').props.children).toBe('true'));
    expect(getByTestId('locale').props.children).toBe('es');
    expect(adapter.stored).toBe('es');
  });

  it('cambiar el idioma no remonta otros proveedores ni pierde estado local (sin logout)', async () => {
    let mounts = 0;
    function SessionLike() {
      const [counter, setCounter] = useState(0);
      React.useEffect(() => {
        mounts += 1;
      }, []);
      const { t } = useLocale();
      const { themeMode } = useAppTheme();
      return (
        <View>
          <Text testID="counter" onPress={() => setCounter((c) => c + 1)}>
            {counter}
          </Text>
          <Text testID="label">{t('profile.logout.button')}</Text>
          <Text testID="theme">{themeMode}</Text>
        </View>
      );
    }

    const adapter = new MemoryLocaleAdapter(null);
    const { getByTestId } = await render(
      <LocaleProvider storageAdapter={adapter}>
        <ThemeProvider initialMode="dark">
          <SessionLike />
          <Probe />
        </ThemeProvider>
      </LocaleProvider>
    );
    await waitFor(() => expect(getByTestId('loaded').props.children).toBe('true'));
    await fireEvent.press(getByTestId('counter'));
    await fireEvent.press(getByTestId('counter'));
    expect(getByTestId('counter').props.children).toBe(2);
    expect(getByTestId('label').props.children).toBe('Cerrar sesión');

    await act(async () => {
      await latest!.setLocale('en');
    });

    expect(getByTestId('label').props.children).toBe('Sign out');
    expect(getByTestId('counter').props.children).toBe(2);
    expect(getByTestId('theme').props.children).toBe('dark');
    expect(mounts).toBe(1);
  });

  it('rechaza un idioma no soportado sin cambiar el estado', async () => {
    const adapter = new MemoryLocaleAdapter(null);
    const { getByTestId } = await render(
      <LocaleProvider storageAdapter={adapter} initialLocale="es">
        <Probe />
      </LocaleProvider>
    );
    await waitFor(() => expect(getByTestId('loaded').props.children).toBe('true'));
    let rejection: unknown = null;
    await act(async () => {
      rejection = await latest!.setLocale('fr' as never).catch((e) => e);
    });
    expect(rejection).toMatchObject({ code: 'invalid_locale' });
    expect(getByTestId('locale').props.children).toBe('es');
    expect(adapter.saves).toEqual([]);
  });
});
