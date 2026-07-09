import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native'
import { glass } from '../theme/colors'

interface Props extends TextInputProps {
  label: string
}

// Matches the translucent dark inputs on apps/web/app/login/page.tsx
// (rgba(255,255,255,0.07) bg, rgba(255,255,255,0.12) border, white text).
export function GlassInput({ label, ...props }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={glass.textFaint}
        style={styles.input}
        {...props}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: glass.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: glass.inputBg,
    borderWidth: 1,
    borderColor: glass.inputBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: glass.textPrimary,
  },
})
