interface RupiahInputProps {
  /** Hanya digit (mis. "115000"); string kosong = belum diisi. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  required?: boolean
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

/**
 * Input harga dengan pemisah ribuan ("115.000"). Nilai yang dikirim ke state
 * tetap string digit murni, jadi form yang sudah memakai `Number(value)` /
 * `parseRupiah(value)` tidak perlu diubah. Beda dengan `NumberInput`, string
 * kosong tetap kosong (tidak berubah jadi 0).
 */
export default function RupiahInput({
  value,
  onChange,
  placeholder,
  className,
  required,
  disabled,
  id,
  'aria-label': ariaLabel,
}: RupiahInputProps) {
  // Nilai awal dari server bisa berupa desimal ("115000.5"); tampilkan bulat.
  const digits = /^\d+\.\d+$/.test(value)
    ? String(Math.trunc(Number(value)))
    : value.replace(/\D/g, '')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      value={digits === '' ? '' : Number(digits).toLocaleString('id-ID')}
      onChange={handleChange}
      className={className}
    />
  )
}
