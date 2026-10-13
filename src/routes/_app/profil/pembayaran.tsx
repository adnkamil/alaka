import { useState } from 'react'
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Landmark, Lock, Plus, QrCode, Wallet } from 'lucide-react'
import PaymentMethodModal from '../../../components/PaymentMethodModal'
import type { PaymentMethodFormValue } from '../../../components/PaymentMethodModal'
import ProBadge from '../../../components/ProBadge'
import ProLockPrompt from '../../../components/ProLockPrompt'
import Switch from '../../../components/ui/Switch'
import { currentUserQuery } from '../../../lib/queries'
import {
  createPaymentMethod,
  deletePaymentMethod,
  listPaymentMethods,
  setPaymentMethodActive,
  updatePaymentMethod,
} from '../../../lib/payment-methods-functions'
import { canUseFeature } from '../../../lib/subscription'
import type { ProFeature } from '../../../lib/subscription'

const paymentMethodsQuery = queryOptions({
  queryKey: ['payment-methods'],
  queryFn: () => listPaymentMethods(),
})

type PaymentMethod = Awaited<ReturnType<typeof listPaymentMethods>>[number]

function paymentMethodIcon(type: PaymentMethod['type']) {
  if (type === 'wallet') return <Wallet size={18} />
  if (type === 'qris') return <QrCode size={18} />
  return <Landmark size={18} />
}

function paymentMethodSubtitle(method: PaymentMethod) {
  if (method.type === 'qris') {
    return method.qrisImage
      ? 'Gambar QRIS sudah diupload'
      : 'Belum ada gambar QRIS'
  }

  const owner = method.accountName ? `a/n ${method.accountName} · ` : ''
  return `${owner}${method.accountNumber ?? ''}`
}

export const Route = createFileRoute('/_app/profil/pembayaran')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(currentUserQuery),
      context.queryClient.ensureQueryData(paymentMethodsQuery),
    ]),
  component: PembayaranPage,
})

function PembayaranPage() {
  const { data: user } = useSuspenseQuery(currentUserQuery)
  const { data: paymentMethods } = useSuspenseQuery(paymentMethodsQuery)
  const queryClient = useQueryClient()

  const [paymentModal, setPaymentModal] = useState<
    { mode: 'create' } | { mode: 'edit'; id: string } | null
  >(null)
  const [lockedFeature, setLockedFeature] = useState<ProFeature | null>(null)

  const paymentMethodsUnlocked = user
    ? canUseFeature(user.entitlements, 'payment_methods')
    : false

  function runPaymentMethodAction(action: () => void) {
    if (paymentMethodsUnlocked) {
      action()
      return
    }
    setLockedFeature('payment_methods')
  }

  async function refreshPaymentMethods() {
    await queryClient.invalidateQueries({ queryKey: ['payment-methods'] })
    await queryClient.invalidateQueries({ queryKey: ['current-user'] })
  }

  async function handleSavePaymentMethod(value: PaymentMethodFormValue) {
    const payload = {
      ...value,
      qrisImage: value.qrisImage ?? undefined,
    }

    if (paymentModal?.mode === 'edit') {
      await updatePaymentMethod({
        data: { id: paymentModal.id, ...payload },
      })
    } else {
      await createPaymentMethod({ data: payload })
    }
    await refreshPaymentMethods()
    setPaymentModal(null)
  }

  async function handleDeletePaymentMethod(id: string) {
    await deletePaymentMethod({ data: { id } })
    await refreshPaymentMethods()
    setPaymentModal(null)
  }

  async function handleTogglePaymentMethod(id: string, isActive: boolean) {
    await setPaymentMethodActive({ data: { id, isActive } })
    await refreshPaymentMethods()
  }

  const editingPaymentMethod =
    paymentModal?.mode === 'edit'
      ? paymentMethods.find((method) => method.id === paymentModal.id)
      : undefined

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/profil" style={{ color: 'var(--app-text)' }}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-xl font-bold">Pembayaran</h1>
      </header>

      <div
        className="app-card flex flex-col"
        style={{ borderColor: 'var(--app-border)' }}
      >
        {paymentMethods.length === 0 && (
          <p
            className="px-4 py-3 text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {paymentMethodsUnlocked
              ? 'Belum ada metode pembayaran. Tambahkan bank, e-wallet, atau QRIS supaya pelanggan bisa bayar.'
              : 'Metode pembayaran (bank, e-wallet, QRIS) bisa ditambahkan di paket PRO.'}
          </p>
        )}

        {paymentMethods.map((method) => (
          <div
            key={method.id}
            className="flex items-center gap-3 border-b px-4 py-3"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <span style={{ color: 'var(--app-text-soft)' }}>
              {paymentMethodIcon(method.type)}
            </span>
            <button
              type="button"
              onClick={() =>
                runPaymentMethodAction(() =>
                  setPaymentModal({ mode: 'edit', id: method.id }),
                )
              }
              className="min-w-0 flex-1 text-left"
              style={{ color: 'var(--app-text)' }}
            >
              <span className="flex items-center gap-2">
                <span className="truncate">{method.provider}</span>
                {!method.isActive && (
                  <span
                    className="app-badge flex-shrink-0"
                    style={{
                      background: 'var(--app-border)',
                      color: 'var(--app-text-soft)',
                    }}
                  >
                    Nonaktif
                  </span>
                )}
              </span>
              <span
                className="block truncate text-xs font-normal"
                style={{ color: 'var(--app-text-soft)' }}
              >
                {paymentMethodSubtitle(method)}
              </span>
            </button>
            <Switch
              checked={method.isActive}
              onChange={(checked) =>
                runPaymentMethodAction(
                  () => void handleTogglePaymentMethod(method.id, checked),
                )
              }
              label={`Aktifkan ${method.provider}`}
            />
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            runPaymentMethodAction(() => setPaymentModal({ mode: 'create' }))
          }
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
          style={{
            color: paymentMethodsUnlocked
              ? 'var(--app-accent)'
              : 'var(--app-text-mute)',
          }}
        >
          {paymentMethodsUnlocked ? <Plus size={18} /> : <Lock size={18} />}
          <span className="flex-1 text-sm font-semibold">
            Tambah metode pembayaran
          </span>
          {!paymentMethodsUnlocked && <ProBadge />}
        </button>
      </div>

      {paymentModal && (
        <PaymentMethodModal
          title={
            paymentModal.mode === 'edit'
              ? 'Edit Metode Pembayaran'
              : 'Tambah Metode Pembayaran'
          }
          submitLabel={paymentModal.mode === 'edit' ? 'Simpan perubahan' : 'Tambah'}
          initialValue={
            editingPaymentMethod
              ? {
                  type: editingPaymentMethod.type,
                  provider: editingPaymentMethod.provider,
                  accountNumber: editingPaymentMethod.accountNumber ?? '',
                  accountName: editingPaymentMethod.accountName ?? '',
                  qrisImage: editingPaymentMethod.qrisImage,
                  isActive: editingPaymentMethod.isActive,
                }
              : undefined
          }
          onClose={() => setPaymentModal(null)}
          onSubmit={handleSavePaymentMethod}
          onDelete={
            paymentModal.mode === 'edit'
              ? () => handleDeletePaymentMethod(paymentModal.id)
              : undefined
          }
        />
      )}

      <ProLockPrompt
        feature={lockedFeature}
        entitlements={user?.entitlements ?? null}
        onClose={() => setLockedFeature(null)}
      />
    </main>
  )
}

