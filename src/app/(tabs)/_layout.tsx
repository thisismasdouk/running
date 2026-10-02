import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { useColors } from '@/components/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  };
}

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: c.accent, headerTitleStyle: { fontWeight: '800' } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen
        name="start"
        options={{
          title: 'Record',
          tabBarIcon: ({ size }) => (
            <View style={[styles.record, { backgroundColor: c.accent }]}>
              <Ionicons name="play" color="#fff" size={size - 4} />
            </View>
          ),
          tabBarActiveTintColor: c.accent,
        }}
        listeners={{
          // This tab is a launcher for the full-screen recorder rather than a real screen.
          tabPress: (e) => {
            e.preventDefault();
            router.push('/record');
          },
        }}
      />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon('stats-chart') }} />
      <Tabs.Screen name="food" options={{ title: 'Food', tabBarIcon: icon('restaurant') }} />
      <Tabs.Screen name="profile" options={{ title: 'You', tabBarIcon: icon('person') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  record: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
