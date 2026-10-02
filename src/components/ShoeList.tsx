import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { confirm } from '@/lib/confirm';
import { formatDistance } from '@/lib/format';
import { shoeDistances, shoeLimitM, shoeWornOut, sortShoes } from '@/lib/shoes';
import type { Run, Shoe, Units } from '@/lib/types';
import { addShoe, deleteShoe, updateProfile, updateShoe, useShoes } from '@/store';
import { useColors } from './theme';
import { Button, Card } from './ui';

/** Shoes with their mileage, a default for new runs, retire and delete (You tab). */
export function ShoeList({ runs, units, defaultShoeId }: { runs: Run[]; units: Units; defaultShoeId: string | null }) {
  const c = useColors();
  const shoes = useShoes();
  const [name, setName] = useState('');
  const sorted = useMemo(() => sortShoes(shoes), [shoes]);
  const distances = useMemo(() => shoeDistances(runs), [runs]);

  const add = () => {
    const n = name.trim();
    if (!n) return;
    addShoe(n);
    setName('');
  };

  return (
    <Card style={{ gap: 12 }}>
      {sorted.length === 0 && (
        <Text style={{ color: c.muted, lineHeight: 20 }}>
          Add the shoes you run in to see how far each pair has gone. Most are worn out by about {formatDistance(shoeLimitM(units), units, 0)}.
        </Text>
      )}
      {sorted.map((shoe) => (
        <ShoeRow key={shoe.id} shoe={shoe} distanceM={distances.get(shoe.id) ?? 0} units={units} isDefault={shoe.id === defaultShoeId} />
      ))}
      <View style={styles.addRow}>
        <TextInput
          value={name}
          onChangeText={setName}
          onSubmitEditing={add}
          placeholder="New shoe, e.g. Pegasus 41"
          placeholderTextColor={c.muted}
          returnKeyType="done"
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
        />
        <Button title="Add" onPress={add} disabled={!name.trim()} style={styles.addBtn} />
      </View>
    </Card>
  );
}

function ShoeRow({ shoe, distanceM, units, isDefault }: { shoe: Shoe; distanceM: number; units: Units; isDefault: boolean }) {
  const c = useColors();
  const worn = shoeWornOut(distanceM, units);
  const pct = Math.min(1, distanceM / shoeLimitM(units));

  const remove = async () => {
    if (!(await confirm('Delete shoe?', `"${shoe.name}" will be removed. Runs that used it are kept.`, 'Delete', true))) return;
    deleteShoe(shoe.id);
  };

  return (
    <View style={[styles.shoe, { borderColor: c.border, opacity: shoe.retired ? 0.6 : 1 }]}>
      <View style={styles.shoeHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.shoeName, { color: c.text }]} numberOfLines={1}>
            {shoe.name}
          </Text>
          <Text style={{ color: worn ? c.danger : c.muted, fontSize: 13, fontWeight: worn ? '700' : '400' }}>
            {formatDistance(distanceM, units, 0)}
            {shoe.retired ? ' · Retired' : isDefault ? ' · Default' : ''}
            {worn && !shoe.retired ? ' · Time for a new pair' : ''}
          </Text>
        </View>
        {!shoe.retired && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isDefault ? `${shoe.name} is the default shoe` : `Make ${shoe.name} the default shoe`}
            accessibilityState={{ selected: isDefault }}
            onPress={() => updateProfile({ defaultShoeId: isDefault ? null : shoe.id })}
            hitSlop={8}
          >
            <Ionicons name={isDefault ? 'star' : 'star-outline'} size={22} color={isDefault ? c.accent : c.muted} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shoe.retired ? `Bring back ${shoe.name}` : `Retire ${shoe.name}`}
          onPress={() => updateShoe(shoe.id, { retired: !shoe.retired })}
          hitSlop={8}
        >
          <Ionicons name={shoe.retired ? 'arrow-undo-outline' : 'archive-outline'} size={22} color={c.muted} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${shoe.name}`} onPress={remove} hitSlop={8}>
          <Ionicons name="trash-outline" size={22} color={c.danger} />
        </Pressable>
      </View>
      <View style={[styles.track, { backgroundColor: c.track }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: worn ? c.danger : pct > 0.8 ? c.warn : c.good }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shoe: { gap: 8, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  shoeHead: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  shoeName: { fontSize: 16, fontWeight: '600' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  addBtn: { paddingVertical: 10, paddingHorizontal: 18 },
});
