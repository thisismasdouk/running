import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { FoodForm } from '@/components/FoodForm';
import { useColors } from '@/components/theme';
import { Empty } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { formatDateTime } from '@/lib/format';
import { deleteMealPhoto } from '@/lib/meal-files';
import { goBack } from '@/lib/nav';
import { deleteFood, saveFood, useFood } from '@/store';

export default function EditFood() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useFood().find((e) => e.id === id);

  if (!entry) return <Empty title="Entry not found" body="It may have been deleted." />;

  const remove = async () => {
    if (!(await confirm('Delete entry?', `"${entry.name}" will be removed from your log.`, 'Delete', true))) return;
    deleteFood(entry.id);
    deleteMealPhoto(entry.photoUri);
    goBack('/food');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Stack.Screen
          options={{
            title: entry.name,
            headerRight: () => (
              <Pressable accessibilityLabel="Delete entry" onPress={remove} hitSlop={8}>
                <Ionicons name="trash-outline" size={22} color={c.danger} />
              </Pressable>
            ),
          }}
        />
        {entry.photoUri && <Image source={{ uri: entry.photoUri }} style={styles.photo} contentFit="cover" />}
        <Text style={{ color: c.muted }}>
          {formatDateTime(entry.at)}
          {entry.source === 'ai' ? ' · AI estimate' : ''}
        </Text>
        <FoodForm
          initial={entry}
          onSave={(d) => {
            saveFood({ ...entry, ...d });
            goBack('/food');
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16 },
});
