import { useNavigate } from '@tanstack/react-router'
import ConfirmModal from './ui/ConfirmModal'
import {
  PLAN_INFO,
  PRO_FEATURES,
  PRO_FEATURE_INFO,
  featureLockedMessage,
  planLabel,
} from '../lib/subscription'
import type { Entitlement, ProFeature } from '../lib/subscription'

interface ProLockPromptProps {
  /** Fitur yang lagi dicoba dibuka. `null` = dialog ketutup. */
  feature: ProFeature | null
  /** Entitlement user (dari `fetchCurrentUser`) — buat nampilin status plan. */
  entitlements?: Entitlement | null
  /** Aksi tombol upgrade. Default: buka halaman Paket & Langganan. */
  onUpgrade?: () => void
  onClose: () => void
}

/** Kalimat status plan user, mis. "Status akunmu sekarang: FREE. ...". */
function planStatusText(entitlements: Entitlement) {
  const plan = entitlements.plan
  return `Status akunmu sekarang: ${planLabel(plan)}. ${PLAN_INFO[plan].description}`
}

/**
 * Dialog seragam buat fitur PRO yang sedang terkunci. Dipakai halaman mana pun,
 * jadi komponen cukup mengirim kunci fiturnya (`'billing'`, dst) — nggak perlu
 * tahu soal trial/plan dan nggak menulis pesan sendiri-sendiri.
 *
 * Selain bilang terkunci, dialog ini nawarin jalan keluarnya: daftar isi paket
 * PRO + tombol "Upgrade ke PRO" yang mengarah ke halaman Paket & Langganan.
 */
export default function ProLockPrompt({
  feature,
  entitlements = null,
  onUpgrade,
  onClose,
}: ProLockPromptProps) {
  const navigate = useNavigate()
  const info = feature ? PRO_FEATURE_INFO[feature] : null

  // ConfirmModal cuma nerima `content` berupa teks, jadi semua kalimat digabung
  // jadi satu paragraf: penjelasan fitur, isi paket PRO, lalu status plan user.
  const message = feature
    ? [
        `${PRO_FEATURE_INFO[feature].description} ${featureLockedMessage(feature)}`,
        `Paket PRO membuka: ${PRO_FEATURES.map((item) => PRO_FEATURE_INFO[item].label).join(', ')}.`,
        entitlements ? planStatusText(entitlements) : '',
      ]
        .filter(Boolean)
        .join(' ')
    : ''

  function handleUpgrade() {
    // Tutup dulu biar dialognya nggak ikut kelihatan di halaman tujuan.
    onClose()
    if (onUpgrade) {
      onUpgrade()
      return
    }
    void navigate({ to: '/profil/langganan' })
  }

  return (
    <ConfirmModal
      open={feature !== null}
      title={info ? `Fitur ${info.label} khusus PRO` : ''}
      content={message}
      okText="Upgrade ke PRO"
      cancelText="Nanti saja"
      danger={false}
      onOk={handleUpgrade}
      onCancel={onClose}
    />
  )
}
