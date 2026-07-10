import { useCallback, useState } from 'react'
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Users, Plus } from 'lucide-react-native'
import * as usersApi from '../../../src/api/users.api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { Button } from '../../../src/components/Button'
import type { StaffUser } from '../../../src/api/users.api'
import { colors } from '../../../src/theme/colors'

const ROLES = ['STAFF', 'MANAGER'] as const

export default function TeamScreen() {
  const { user } = useAuthStore()
  const isOwner = user?.role === 'OWNER'
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<(typeof ROLES)[number]>('STAFF')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setStaff(await usersApi.listStaff())
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (isOwner) load()
    }, [load, isOwner]),
  )

  if (!isOwner) {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateText}>Team management is OWNER only.</Text>
      </View>
    )
  }

  async function toggleActive(member: StaffUser) {
    await usersApi.updateStaff(member.id, { isActive: !member.isActive })
    setStaff((prev) => prev.map((s) => (s.id === member.id ? { ...s, isActive: !s.isActive } : s)))
  }

  async function submitNewStaff() {
    if (!name || !email || password.length < 6) return
    setSaving(true)
    try {
      const created = await usersApi.createStaff({ name, email, password, role })
      setStaff((prev) => [...prev, created])
      setModalOpen(false)
      setName('')
      setEmail('')
      setPassword('')
      setRole('STAFF')
    } catch (err: any) {
      Alert.alert('Could not add staff', err.message ?? 'Please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={staff}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Users size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>No staff added yet</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{item.name}</Text>
              <Text style={styles.memberMeta}>
                {item.email} · {item.role}
              </Text>
            </View>
            <Pressable style={[styles.statusPill, item.isActive ? styles.statusActive : styles.statusInactive]} onPress={() => toggleActive(item)}>
              <Text style={[styles.statusPillText, item.isActive ? { color: colors.status.success.fg } : { color: colors.status.danger.fg }]}>
                {item.isActive ? 'Active' : 'Deactivated'}
              </Text>
            </Pressable>
          </View>
        )}
      />

      <Pressable style={styles.fab} onPress={() => setModalOpen(true)}>
        <Plus size={22} color="#fff" />
      </Pressable>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Staff Member</Text>
            <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <TextInput style={styles.input} placeholder="Temporary password" value={password} onChangeText={setPassword} secureTextEntry />
            <View style={styles.roleRow}>
              {ROLES.map((r) => (
                <Pressable key={r} style={[styles.roleChip, role === r && styles.roleChipActive]} onPress={() => setRole(r)}>
                  <Text style={[styles.roleChipText, role === r && styles.roleChipTextActive]}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <Button title="Add Staff" onPress={submitNewStaff} loading={saving} disabled={!name || !email || password.length < 6} />
            <Pressable style={{ marginTop: 10, alignItems: 'center' }} onPress={() => setModalOpen(false)}>
              <Text style={{ color: colors.textMuted }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 },
  gateText: { color: colors.textMuted, fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 80 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 10 },
  memberName: { fontWeight: '800', color: colors.textPrimary, fontSize: 14 },
  memberMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusActive: { backgroundColor: colors.status.success.bg },
  statusInactive: { backgroundColor: colors.status.danger.bg },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.cardBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: 14 },
  input: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14, backgroundColor: colors.inputBg, color: colors.textPrimary },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  roleChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.mutedBg },
  roleChipActive: { backgroundColor: colors.brand },
  roleChipText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  roleChipTextActive: { color: '#fff' },
})
