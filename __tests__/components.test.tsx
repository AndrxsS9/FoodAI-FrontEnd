import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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

    it('displays error message when provided', async () => {
      const screen = await render(
        <Input label="Email" errorMessage="Campo obligatorio" />
      );

      expect(screen.getByText('Campo obligatorio')).toBeTruthy();
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
  });

  describe('Stepper', () => {
    it('increments and decrements within bounds', async () => {
      const onChangeMock = jest.fn();
      const screen = await render(
        <Stepper value={3} onChange={onChangeMock} min={1} max={5} unit="un" />
      );

      expect(screen.getByText('3 un')).toBeTruthy();

      const minusBtn = screen.getByLabelText('Disminuir');
      fireEvent.press(minusBtn);
      expect(onChangeMock).toHaveBeenCalledWith(2);

      const plusBtn = screen.getByLabelText('Aumentar');
      fireEvent.press(plusBtn);
      expect(onChangeMock).toHaveBeenCalledWith(4);
    });
  });
});
