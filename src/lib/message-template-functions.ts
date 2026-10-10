import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSessionUser } from './auth'
import { updateUserMessageTemplate } from './brand-queries'
import { DEFAULT_WA_MESSAGE_TEMPLATE } from './message-template'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

export const getMessageTemplate = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await requireUser()
    return user.waMessageTemplate || DEFAULT_WA_MESSAGE_TEMPLATE
  },
)

const updateMessageTemplateSchema = z.object({
  template: z
    .string()
    .min(1, 'Template tidak boleh kosong')
    .max(2000, 'Template maksimal 2000 karakter'),
})

export const updateMessageTemplate = createServerFn({ method: 'POST' })
  .validator(updateMessageTemplateSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()

    const template = data.template.trim()
    if (template.length === 0) {
      throw new Error('Template tidak boleh kosong')
    }

    await updateUserMessageTemplate(user, template)
  })
