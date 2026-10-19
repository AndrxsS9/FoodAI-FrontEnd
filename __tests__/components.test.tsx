import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react-native';
import {
  Button,
  Card,
  Chip,
  Header,
  Input,
  Stepper,
} from '../src/components/common';
import { Text } from 'react-native';

describe('FoodAI Common Components', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Button', () => {
    it('renders title and triggers onPress', async () => {
      const onPressMock = jest.fn();
      const screen = await render(
        <Button title="Cocinar con esto" onPress={onPressMock} />
      );

      const button = screen.getByText('Cocinar con esto');
      expect(button).toBeTruthy();

      fireEvent.press(button);
      expect(onPressMock).toHaveBeenCalledTimes(1);
    });

    it('does not trigger onPress when disabled', async () => {
      const onPressMock = jest.fn();
      const screen = await render(
        <Button title="Deshabilitado" onPress={onPressMock} disabled />
      );

      fireEvent.press(screen.getByText('Deshabilitado'));
      expect(onPressMock).not.toHaveBeenCalled();
    });

    it('shows loading indicator and prevents interactions when loading', async () => {
      const onPressMock = jest.fn();
      const screen = await render(
        <Button title="Guardar" onPress={onPressMock} loading />
      );

      const button = screen.getByRole('button');
      expect(button).toBeTruthy();
      expect(screen.queryByText('Guardar')).toBeNull();

      fireEvent.press(button);
      expect(onPressMock).not.toHaveBeenCalled();
    });

    it('sets accessibility state busy and disabled when loading', async () => {
      const screen = await render(
        <Button title="Procesar" onPress={jest.fn()} loading />
      );
      const button = screen.getByRole('button');
      expect(button.props.accessibilityState).toEqual({
        disabled: true,
        busy: true,
      });
      expect(button.props.accessibilityLabel).toContain('cargando');
    });
  });

  describe('Card', () => {
    it('renders children correctly', async () => {
      const screen = await render(
        <Card>
          <Text>Contenido de tarjeta</Text>
        </Card>
      );

      expect(screen.getByText('Contenido de tarjeta')).toBeTruthy();
    });

    it('handles press event when onPress is provided', async () => {
      const onPressMock = jest.fn();
      const screen = await render(
        <Card onPress={onPressMock}>
          <Text>Tarjeta clickeable</Text>
        </Card>
      );

      fireEvent.press(screen.getByText('Tarjeta clickeable'));
      expect(onPressMock).toHaveBeenCalledTimes(1);
    });

    it('does not trigger onPress when card is disabled', async () => {
      const onPressMock = jest.fn();
      const screen = await render(
        <Card onPress={onPressMock} disabled>
          <Text>Tarjeta deshabilitada</Text>
        </Card>
      );

      fireEvent.press(screen.getByText('Tarjeta deshabilitada'));
      expect(onPressMock).not.toHaveBeenCalled();
    });
  });

  describe('Chip', () => {
    it('renders label and handles selection press', async () => {
      const onPressMock = jest.fn();
      const screen = await render(
        <Chip label="Consumir pronto" onPress={onPressMock} />
      );

      const chip = screen.getByText('Consumir pronto');
      expect(chip).toBeTruthy();

      fireEvent.press(chip);
      expect(onPressMock).toHaveBeenCalledTimes(1);
    });

    it('reflects selected accessibility state correctly', async () => {
      const screen = await render(
        <Chip label="Filtro activo" selected onPress={jest.fn()} />
      );

      const chip = screen.getByRole('button');
      expect(chip.props.accessibilityState).toEqual({
        selected: true,
        disabled: false,
      });
    });

    it('does not trigger onPress when chip is disabled', async () => {
      const onPressMock = jest.fn();
      const screen = await render(
        <Chip label="Chip inactivo" disabled onPress={onPressMock} />
      );

      fireEvent.press(screen.getByText('Chip inactivo'));
      expect(onPressMock).not.toHaveBeenCalled();
    });

    it('renders as non-pressable view when onPress is not provided', async () => {
      const screen = await render(<Chip label="Etiqueta fija" />);
      expect(screen.getByText('Etiqueta fija')).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('Input', () => {
    it('renders label and handles text change', async () => {
      const onChangeMock = jest.fn();
      const screen = await render(
        <Input
          label="Presupuesto"
          placeholder="Ingresa valor"
          onChangeText={onChangeMock}
        />
      );

      expect(screen.getByText('Presupuesto')).toBeTruthy();
      const input = screen.getByPlaceholderText('Ingresa valor');
      fireEvent.changeText(input, '$15.000');
      expect(onChangeMock).toHaveBeenCalledWith('$15.000');
    });

    it('displays error message and sets aria-invalid when provided', async () => {
      const screen = await render(
        <Input label="Email" placeholder="correo@ejemplo.com" errorMessage="Campo obligatorio" />
      );

      expect(screen.getByText('Campo obligatorio')).toBeTruthy();
      const input = screen.getByPlaceholderText('correo@ejemplo.com');
      expect(input.props['aria-invalid']).toBe(true);
    });

    it('handles focus event', async () => {
      const onFocusMock = jest.fn();
      const screen = await render(
        <Input placeholder="Escribe aqui" onFocus={onFocusMock} />
      );

      const input = screen.getByPlaceholderText('Escribe aqui');
      fireEvent(input, 'focus');
      expect(onFocusMock).toHaveBeenCalledTimes(1);
    });

    it('handles blur event', async () => {
      const onBlurMock = jest.fn();
      const screen = await render(
        <Input placeholder="Escribe aqui" onBlur={onBlurMock} />
      );

      const input = screen.getByPlaceholderText('Escribe aqui');
      fireEvent(input, 'blur');
      expect(onBlurMock).toHaveBeenCalledTimes(1);
    });

    it('applies disabled state when disabled prop is true', async () => {
      const screen = await render(
        <Input label="Bloqueado" placeholder="No editable" disabled />
      );

      const input = screen.getByPlaceholderText('No editable');
      expect(input.props.editable).toBe(false);
      expect(input.props.accessibilityState).toEqual({ disabled: true });
    });
  });

  describe('Header', () => {
    it('renders title and triggers back button press', async () => {
      const onBackMock = jest.fn();
      const screen = await render(
        <Header title="Mi Despensa" showBack onBack={onBackMock} />
      );

      expect(screen.getByText('Mi Despensa')).toBeTruthy();
      const backButton = screen.getByLabelText('Volver');
      fireEvent.press(backButton);
      expect(onBackMock).toHaveBeenCalledTimes(1);
    });

    it('does not render back button when showBack is false', async () => {
      const screen = await render(<Header title="Dashboard" showBack={false} />);
      expect(screen.getByText('Dashboard')).toBeTruthy();
      expect(screen.queryByLabelText('Volver')).toBeNull();
    });

    it('renders subtitle correctly', async () => {
      const screen = await render(
        <Header title="Recetas" subtitle="5 opciones disponibles" />
      );
      expect(screen.getByText('5 opciones disponibles')).toBeTruthy();
    });
  });

  describe('Stepper', () => {
    it('increments within bounds', async () => {
      const onChangeMock = jest.fn();
      const screen = await render(
        <Stepper value={3} onChange={onChangeMock} min={1} max={5} unit="un" />
      );

      expect(screen.getByText('3 un')).toBeTruthy();

      const plusBtn = screen.getByLabelText('Aumentar');
      fireEvent.press(plusBtn);
      expect(onChangeMock).toHaveBeenCalledWith(4);
    });

    it('decrements within bounds', async () => {
      const onChangeMock = jest.fn();
      const screen = await render(
        <Stepper value={3} onChange={onChangeMock} min={1} max={5} unit="un" />
      );

      expect(screen.getByText('3 un')).toBeTruthy();

      const minusBtn = screen.getByLabelText('Disminuir');
      fireEvent.press(minusBtn);
      expect(onChangeMock).toHaveBeenCalledWith(2);
    });

    it('disables decrement button when value equals min', async () => {
      const onChangeMock = jest.fn();
      const screen = await render(
        <Stepper value={1} onChange={onChangeMock} min={1} max={5} />
      );

      const minusBtn = screen.getByLabelText('Disminuir');
      expect(minusBtn.props.accessibilityState.disabled).toBe(true);
      fireEvent.press(minusBtn);
      expect(onChangeMock).not.toHaveBeenCalled();
    });

    it('disables increment button when value equals max', async () => {
      const onChangeMock = jest.fn();
      const screen = await render(
        <Stepper value={5} onChange={onChangeMock} min={1} max={5} />
      );

      const plusBtn = screen.getByLabelText('Aumentar');
      expect(plusBtn.props.accessibilityState.disabled).toBe(true);
      fireEvent.press(plusBtn);
      expect(onChangeMock).not.toHaveBeenCalled();
    });

    it('handles decimal step increment precision accurately without floating point errors', async () => {
      const onChangeMock = jest.fn();
      const screen = await render(
        <Stepper value={0.2} onChange={onChangeMock} min={0} max={1} step={0.1} />
      );

      const plusBtn = screen.getByLabelText('Aumentar');
      fireEvent.press(plusBtn);
      expect(onChangeMock).toHaveBeenCalledWith(0.3);
    });

    it('handles decimal step decrement precision accurately without floating point errors', async () => {
      const onChangeMock = jest.fn();
      const screen = await render(
        <Stepper value={0.3} onChange={onChangeMock} min={0} max={1} step={0.1} />
      );

      const minusBtn = screen.getByLabelText('Disminuir');
      fireEvent.press(minusBtn);
      expect(onChangeMock).toHaveBeenCalledWith(0.2);
    });

    it('recovers safely from invalid min/max configurations (min > max)', async () => {
      const onChangeMock = jest.fn();
      const screen = await render(
        <Stepper value={5} onChange={onChangeMock} min={10} max={2} />
      );

      // Safe normalization ensures min is 2 and max is 10
      expect(screen.getByText('5')).toBeTruthy();
      const minusBtn = screen.getByLabelText('Disminuir');
      fireEvent.press(minusBtn);
      expect(onChangeMock).toHaveBeenCalledWith(4);
    });

    it('handles non-finite values (NaN, Infinity) safely without crashing', async () => {
      const onChangeMock = jest.fn();
      const screen = await render(
        <Stepper
          value={NaN}
          onChange={onChangeMock}
          min={NaN}
          max={Infinity}
          step={NaN}
        />
      );

      // Value falls back safely to safeMin (0)
      expect(screen.getByText('0')).toBeTruthy();
      const plusBtn = screen.getByLabelText('Aumentar');
      fireEvent.press(plusBtn);
      expect(onChangeMock).toHaveBeenCalledWith(1);
    });

    it('handles values outside configured range by clamping to boundaries', async () => {
      const screenOver = await render(
        <Stepper value={100} onChange={jest.fn()} min={1} max={10} />
      );
      expect(screenOver.getByText('10')).toBeTruthy();
    });

    it('handles values under configured range by clamping to min boundary', async () => {
      const screenUnder = await render(
        <Stepper value={-50} onChange={jest.fn()} min={0} max={10} />
      );
      expect(screenUnder.getByText('0')).toBeTruthy();
    });

    it('prevents interactions when stepper is disabled', async () => {
      const onChangeMock = jest.fn();
      const screen = await render(
        <Stepper value={3} onChange={onChangeMock} min={1} max={5} disabled />
      );

      const minusBtn = screen.getByLabelText('Disminuir');
      const plusBtn = screen.getByLabelText('Aumentar');

      expect(minusBtn.props.accessibilityState.disabled).toBe(true);
      expect(plusBtn.props.accessibilityState.disabled).toBe(true);

      fireEvent.press(minusBtn);
      expect(onChangeMock).not.toHaveBeenCalled();
    });
  });
});
