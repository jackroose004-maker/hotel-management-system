import { useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useRouter } from 'expo-router'
import * as tablesApi from '../src/api/tables.api'
import { startNewTableSession } from '../src/stores/guestSession.store'
import { useCartStore } from '../src/stores/cart.store'
import { extractQrCode } from '../src/utils/qr'
import { Button } from '../src/components/Button'
import { useBrandStore } from '../src/stores/brand.store'
import { colors } from '../src/theme/colors'

export default function ScanScreen() {
  const router = useRouter()
  const brandColor = useBrandStore((s) => s.brandColor)
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [devCode, setDevCode] = useState('')
  const setTableId = useCartStore((s) => s.setTableId)

  async function resolveTable(qrCode: string) {
    try {
      const table = await tablesApi.getByQrCode(qrCode)
      await startNewTableSession(table.id)
      setTableId(table.id)
      router.replace('/(guest)/menu')
    } catch (err: any) {
      Alert.alert('Table not found', err.message ?? 'Could not resolve this QR code', [
        { text: 'Try again', onPress: () => setScanned(false) },
      ])
    }
  }

  async function handleScan(result: { data: string }) {
    if (scanned) return
    setScanned(true)
    const code = extractQrCode(result.data)
    if (!code) {
      Alert.alert('Not a table QR code', 'Please scan the QR code printed on your table.', [
        { text: 'Try again', onPress: () => setScanned(false) },
      ])
      return
    }
    resolveTable(code)
  }

  if (!permission) return <View style={styles.center} />

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Al Manzil needs camera access to scan table QR codes.</Text>
        <Button title="Grant Camera Access" onPress={requestPermission} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleScan}
      />
      <View style={[styles.frame, { borderColor: brandColor }]} />
      <Text style={styles.hint}>Point your camera at the QR code on your table</Text>

      {__DEV__ && (
        <View style={styles.devPanel}>
          <Text style={styles.devLabel}>DEV: enter table qrCode manually</Text>
          <TextInput
            style={styles.devInput}
            value={devCode}
            onChangeText={setDevCode}
            placeholder="table-xxxxxxxx-..."
            placeholderTextColor="#999"
          />
          <Button title="Resolve" onPress={() => devCode && resolveTable(devCode)} disabled={!devCode} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24, gap: 16 },
  permissionText: { fontSize: 15, color: colors.textPrimary, textAlign: 'center' },
  frame: {
    position: 'absolute',
    top: '30%',
    left: '15%',
    width: '70%',
    height: '30%',
    borderWidth: 3,
    borderRadius: 16,
  },
  hint: { position: 'absolute', bottom: 40, alignSelf: 'center', color: '#fff', fontSize: 14 },
  devPanel: { position: 'absolute', bottom: 90, left: 16, right: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8 },
  devLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  devInput: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, padding: 10, fontSize: 14 },
})
