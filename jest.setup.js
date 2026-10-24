globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// @ts-ignore
global.IS_REACT_ACT_ENVIRONMENT = true;
jest.setTimeout(30000);

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');

  const MockIcon = ({ name, ...props }) => {
    return React.createElement(Text, { ...props, testID: `icon-${name}` }, name);
  };

  return {
    MaterialIcons: MockIcon,
    Ionicons: MockIcon,
    Feather: MockIcon,
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

