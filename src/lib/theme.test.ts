import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runInNewContext } from 'node:vm'
import { DEFAULT_THEME_MODE, buildThemeInitScript } from './theme'

/**
 * Tes default tema & script init tema (dipasang di `<head>` oleh `__root.tsx`).
 *
 * Syarat produk: **auto gelap mati sebagai default** — app dibuka terang kalau
 * user belum pernah memilih mode, walau HP-nya mode gelap. Karena script ini
 * jalan sebelum React hydrate, tesnya pakai sandbox minimal (node:vm), bukan
 * DOM asli.
 */

interface ThemeScriptResult {
  classes: Array<string>
  dataTheme: string | undefined
  colorScheme: string | undefined
}

/** Jalanin script init tema dengan localStorage & setelan sistem palsu. */
function runThemeInitScript({
  stored,
  prefersDark,
}: {
  stored: string | null
  prefersDark: boolean
}): ThemeScriptResult {
  const classes = new Set<string>()
  const attributes = new Map<string, string>()
  const style: { colorScheme?: string } = {}

  const documentElement = {
    classList: {
      add: (name: string) => {
        classes.add(name)
      },
      remove: (...names: Array<string>) => {
        names.forEach((name) => classes.delete(name))
      },
    },
    style,
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value)
    },
    removeAttribute: (name: string) => {
      attributes.delete(name)
    },
  }

  runInNewContext(buildThemeInitScript(DEFAULT_THEME_MODE), {
    window: {
      localStorage: {
        getItem: (key: string) => (key === 'theme' ? stored : null),
      },
      matchMedia: () => ({ matches: prefersDark }),
    },
    document: { documentElement },
  })

  return {
    classes: [...classes],
    dataTheme: attributes.get('data-theme'),
    colorScheme: style.colorScheme,
  }
}

describe('DEFAULT_THEME_MODE', () => {
  it('terang — auto gelap mati', () => {
    assert.equal(DEFAULT_THEME_MODE, 'light')
  })
})

describe('buildThemeInitScript', () => {
  it('belum ada pilihan tersimpan -> terang walau HP-nya mode gelap', () => {
    assert.deepEqual(runThemeInitScript({ stored: null, prefersDark: true }), {
      classes: ['light'],
      dataTheme: 'light',
      colorScheme: 'light',
    })
  })

  it('nilai localStorage tidak dikenal -> jatuh ke default terang', () => {
    assert.deepEqual(
      runThemeInitScript({ stored: 'neon', prefersDark: true }),
      {
        classes: ['light'],
        dataTheme: 'light',
        colorScheme: 'light',
      },
    )
  })

  it('pilihan user yang tersimpan tetap dihormati', () => {
    assert.deepEqual(
      runThemeInitScript({ stored: 'dark', prefersDark: false }),
      {
        classes: ['dark'],
        dataTheme: 'dark',
        colorScheme: 'dark',
      },
    )

    assert.deepEqual(
      runThemeInitScript({ stored: 'light', prefersDark: true }),
      {
        classes: ['light'],
        dataTheme: 'light',
        colorScheme: 'light',
      },
    )
  })

  it("mode 'auto' tetap ikut setelan sistem kalau user memilihnya", () => {
    assert.deepEqual(
      runThemeInitScript({ stored: 'auto', prefersDark: true }),
      {
        classes: ['dark'],
        dataTheme: undefined,
        colorScheme: 'dark',
      },
    )

    assert.deepEqual(
      runThemeInitScript({ stored: 'auto', prefersDark: false }),
      {
        classes: ['light'],
        dataTheme: undefined,
        colorScheme: 'light',
      },
    )
  })
})
