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
